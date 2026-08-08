import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  getAuthUserByEmail,
  getPublicUserByEmail,
  isAccountPhoneVerified,
  normalizePhoneDigits,
  resolveAccountPhone,
  syncUserProfile,
} from '@/lib/auth-users'
import { mintSessionForEmail } from '@/lib/auth-session'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(8),
  channel: z.enum(['phone', 'email']),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }

    const email = parsed.data.email.trim().toLowerCase()
    const otp = parsed.data.otp.trim()
    const channel = parsed.data.channel
    const supabase = createAdminClient()

    const profile = await getPublicUserByEmail(email)
    const authUser = await getAuthUserByEmail(email)

    if (!profile && !authUser) {
      return NextResponse.json(
        { error: 'No account found for this email', code: 'EMAIL_NOT_FOUND' },
        { status: 404 }
      )
    }

    const userId = profile?.id || authUser!.id
    const phoneOnFile = await resolveAccountPhone({
      userId,
      profilePhone: profile?.phone,
      authMetadataPhone:
        typeof authUser?.user_metadata?.phone === 'string'
          ? authUser.user_metadata.phone
          : null,
    })
    const hasPhone = Boolean(phoneOnFile)

    if (channel === 'phone') {
      if (!hasPhone || !phoneOnFile) {
        return NextResponse.json(
          {
            error:
              'This account has no phone on file. Use email verification instead.',
            code: 'NO_PHONE',
          },
          { status: 400 }
        )
      }

      // OTP may have been stored with original formatting; match last-10 as well
      const { data: otpCandidates } = await supabase
        .from('phone_otps')
        .select('*')
        .eq('otp', otp)
        .eq('verified', false)
        .order('created_at', { ascending: false })
        .limit(20)

      const otpRow = (otpCandidates || []).find(
        (row) => normalizePhoneDigits(row.phone) === phoneOnFile
      )

      if (!otpRow) {
        return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
      }

      if (new Date(otpRow.expires_at) < new Date()) {
        return NextResponse.json({ error: 'OTP expired' }, { status: 400 })
      }

      await supabase
        .from('phone_otps')
        .update({ verified: true })
        .eq('id', otpRow.id)

      await supabase.from('verified_phones').upsert({
        phone: phoneOnFile,
        verified_at: new Date().toISOString(),
      })
    } else {
      // Email channel — prove inbox ownership (used when no strong phone was
      // available at lookup). Still attach any phone we can resolve afterward.
      const { data: otpRow } = await supabase
        .from('email_otps')
        .select('*')
        .eq('email', email)
        .eq('otp', otp)
        .eq('verified', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!otpRow) {
        return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
      }

      if (new Date(otpRow.expires_at) < new Date()) {
        return NextResponse.json({ error: 'OTP expired' }, { status: 400 })
      }

      await supabase
        .from('email_otps')
        .update({ verified: true })
        .eq('id', otpRow.id)

      await supabase.from('verified_emails').upsert({
        email,
        verified_at: new Date().toISOString(),
      })
    }

    const fullName =
      profile?.full_name?.trim() ||
      (typeof authUser?.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name
        : null)

    // Re-resolve after OTP in case phone lives on orders/addresses
    const resolvedPhone =
      phoneOnFile ||
      (await resolveAccountPhone({
        userId,
        profilePhone: profile?.phone,
        authMetadataPhone:
          typeof authUser?.user_metadata?.phone === 'string'
            ? authUser.user_metadata.phone
            : null,
      }))

    const phoneAlreadyVerified =
      channel === 'phone' ||
      (resolvedPhone
        ? await isAccountPhoneVerified({
            userId,
            phone: resolvedPhone,
            profilePhoneVerified: profile?.phone_verified,
          })
        : false)

    try {
      await syncUserProfile({
        user_id: userId,
        email,
        full_name: fullName,
        phone: resolvedPhone || null,
        phone_verified: phoneAlreadyVerified,
        email_verified: channel === 'email' ? true : undefined,
      })
    } catch (profileError) {
      logger.warn('Guest reclaim profile sync failed', { profileError, userId })
    }

    const session = await mintSessionForEmail(email)

    const { data: addresses } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    return NextResponse.json({
      success: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      profile: {
        id: userId,
        email,
        full_name: fullName,
        phone: resolvedPhone || null,
        phone_verified: phoneAlreadyVerified,
      },
      addresses: addresses || [],
      requires_phone: !resolvedPhone,
      requires_phone_otp: Boolean(resolvedPhone) && !phoneAlreadyVerified,
    })
  } catch (error) {
    logger.error('Guest reclaim failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Something went wrong' },
      { status: 500 }
    )
  }
}
