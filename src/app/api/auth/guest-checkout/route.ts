import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthUserByEmail, syncUserProfile } from '@/lib/auth-users'
import { mintSessionWithPassword } from '@/lib/auth-session'
import { guestCheckoutAccountSchema } from '@/lib/validations/checkout'
import { sendSetPasswordEmail } from '@/lib/email'
import logger from '@/lib/logger'

function getAppOrigin(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    req.nextUrl.origin
  ).replace(/\/$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = guestCheckoutAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || 'Invalid input',
          details: parsed.error.issues,
        },
        { status: 400 }
      )
    }

    const fullName = parsed.data.full_name.trim()
    const email = parsed.data.email.trim().toLowerCase()
    const phone = parsed.data.phone.trim()

    const supabase = createAdminClient()

    const existingAuthUser = await getAuthUserByEmail(email)
    if (existingAuthUser) {
      return NextResponse.json(
        {
          error:
            'An account with this email already exists. Verify with OTP to continue.',
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
            'An account with this email already exists. Verify with OTP to continue.',
          code: 'EMAIL_EXISTS',
        },
        { status: 409 }
      )
    }

    const { data: verifiedPhone } = await supabase
      .from('verified_phones')
      .select('phone')
      .eq('phone', phone)
      .maybeSingle()

    if (!verifiedPhone) {
      return NextResponse.json(
        { error: 'Please verify your phone number with OTP before continuing' },
        { status: 400 }
      )
    }

    const password = randomBytes(24).toString('base64url')

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          phone_verified: true,
        },
      })

    if (createError || !created.user) {
      logger.error('Guest checkout createUser failed', { createError, email })
      const message = createError?.message || 'Failed to create account'
      if (message.toLowerCase().includes('already')) {
        return NextResponse.json(
          {
            error:
              'An account with this email already exists. Verify with OTP to continue.',
            code: 'EMAIL_EXISTS',
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: message }, { status: 500 })
    }

    try {
      await syncUserProfile({
        user_id: created.user.id,
        email,
        full_name: fullName,
        phone,
        phone_verified: true,
        email_verified: false,
      })
    } catch (profileError) {
      logger.error('Guest checkout profile sync failed', {
        profileError,
        userId: created.user.id,
      })
      return NextResponse.json(
        {
          error:
            'Account created but profile setup failed. Please contact support.',
        },
        { status: 500 }
      )
    }

    const origin = getAppOrigin(req)

    try {
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: 'recovery',
          email,
        })

      if (linkError) {
        logger.warn('Guest checkout set-password link failed', {
          linkError,
          email,
        })
      } else {
        const hashedToken = linkData.properties?.hashed_token
        if (hashedToken) {
          const setPasswordUrl =
            `${origin}/set-password?token_hash=${encodeURIComponent(hashedToken)}` +
            `&type=recovery&email=${encodeURIComponent(email)}`
          await sendSetPasswordEmail(email, fullName, setPasswordUrl)
        }
      }
    } catch (emailError) {
      logger.warn('Guest checkout set-password email failed', {
        emailError,
        email,
      })
    }

    let session
    try {
      session = await mintSessionWithPassword(email, password, created.user.id)
    } catch (signInError) {
      logger.error('Guest checkout auto sign-in failed', {
        signInError,
        email,
      })
      return NextResponse.json(
        {
          error:
            'Account created but automatic sign-in failed. Please sign in with the set-password link from your email.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: {
        id: created.user.id,
        email,
        full_name: fullName,
        phone,
      },
    })
  } catch (error) {
    logger.error('Guest checkout failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Something went wrong' },
      { status: 500 }
    )
  }
}
