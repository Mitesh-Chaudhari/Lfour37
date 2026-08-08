import { NextRequest, NextResponse } from 'next/server'
import {
  getAuthUserByEmail,
  getPublicUserByEmail,
  isAccountPhoneVerified,
  phoneHint,
  resolveAccountPhone,
} from '@/lib/auth-users'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ exists: false })
    }

    const email = parsed.data.email.trim().toLowerCase()
    const profile = await getPublicUserByEmail(email)
    const authUser = await getAuthUserByEmail(email)

    if (!profile && !authUser) {
      return NextResponse.json({ exists: false })
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

    const fullName =
      profile?.full_name?.trim() ||
      (typeof authUser?.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name.trim()
        : null)

    const hasPhone = Boolean(phone)
    const phoneVerified = phone
      ? await isAccountPhoneVerified({
          userId,
          phone,
          profilePhoneVerified: profile?.phone_verified,
        })
      : false

    return NextResponse.json({
      exists: true,
      has_phone: hasPhone,
      phone: phone || null,
      phone_hint: hasPhone ? phoneHint(phone) : null,
      phone_verified: phoneVerified,
      full_name: fullName || null,
      channel: hasPhone ? 'phone' : 'email',
    })
  } catch (error) {
    logger.error('Guest lookup failed', { error })
    return NextResponse.json({ exists: false }, { status: 500 })
  }
}
