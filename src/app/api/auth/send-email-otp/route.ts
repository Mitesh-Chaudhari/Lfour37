import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmailOtpEmail } from '@/lib/email'
import { getAuthUserByEmail } from '@/lib/auth-users'
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

    const existingAuthUser = await getAuthUserByEmail(email)
    if (existingAuthUser) {
      return NextResponse.json(
        {
          error:
            'An account with this email already exists. Please sign in to continue.',
          code: 'EMAIL_EXISTS',
        },
        { status: 409 }
      )
    }

    const { data: profileRows } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .limit(1)

    if (profileRows?.length) {
      return NextResponse.json(
        {
          error:
            'An account with this email already exists. Please sign in to continue.',
          code: 'EMAIL_EXISTS',
        },
        { status: 409 }
      )
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    await supabase.from('email_otps').delete().eq('email', email)

    const { error } = await supabase.from('email_otps').insert({
      email,
      otp,
      verified: false,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })

    if (error) {
      logger.error('Failed to save email OTP', { error, email })
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

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Send email OTP failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send OTP' },
      { status: 500 }
    )
  }
}
