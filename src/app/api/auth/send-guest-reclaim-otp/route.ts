import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  getAuthUserByEmail,
  getPublicUserByEmail,
  phoneHint,
  resolveAccountPhone,
} from '@/lib/auth-users'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'
import { sendEmailOtpEmail } from '@/lib/email'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const email = parsed.data.email.trim().toLowerCase()
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
    const phone = await resolveAccountPhone({
      userId,
      profilePhone: profile?.phone,
      authMetadataPhone:
        typeof authUser?.user_metadata?.phone === 'string'
          ? authUser.user_metadata.phone
          : null,
    })

    if (phone) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()

      await supabase.from('phone_otps').delete().eq('phone', phone)

      const { error } = await supabase.from('phone_otps').insert({
        phone,
        otp,
        verified: false,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })

      if (error) {
        logger.error('Failed to save reclaim phone OTP', { error, email })
        return NextResponse.json({ error: 'Failed to save OTP' }, { status: 500 })
      }

      const result = await sendWhatsAppTemplate({
        phone,
        templateName: 'phone_otp_verify',
        variables: [otp],
      })

      if (!result) {
        return NextResponse.json(
          { error: 'Failed to send OTP on WhatsApp' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        channel: 'phone',
        phone_hint: phoneHint(phone),
      })
    }

    // No phone on file → email OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    await supabase.from('email_otps').delete().eq('email', email)

    const { error } = await supabase.from('email_otps').insert({
      email,
      otp,
      verified: false,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })

    if (error) {
      logger.error('Failed to save reclaim email OTP', { error, email })
      return NextResponse.json(
        {
          error:
            error.message.includes('does not exist') || error.code === '42P01'
              ? 'Email OTP is not configured. Run migration 022_email_otps.sql'
              : 'Failed to save OTP',
        },
        { status: 500 }
      )
    }

    await sendEmailOtpEmail(email, otp)

    return NextResponse.json({
      success: true,
      channel: 'email',
    })
  } catch (error) {
    logger.error('Send guest reclaim OTP failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Something went wrong' },
      { status: 500 }
    )
  }
}
