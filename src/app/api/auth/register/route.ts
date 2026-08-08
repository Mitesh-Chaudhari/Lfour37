import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthUserByEmail, syncUserProfile } from '@/lib/auth-users'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(100),
  phone: z.string().regex(/^[0-9]{10}$/),
  gender: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || 'Invalid request',
        },
        { status: 400 }
      )
    }

    const email = parsed.data.email.trim().toLowerCase()
    const phone = parsed.data.phone.trim()
    const fullName = parsed.data.full_name.trim()
    const { password, gender, dob } = parsed.data

    const supabase = createAdminClient()

    const existingAuthUser = await getAuthUserByEmail(email)
    if (existingAuthUser) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists',
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
          error: 'An account with this email already exists',
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

    // email_confirm: true lets users sign in even if Supabase "Confirm email" is ON,
    // without requiring them to click a confirmation link.
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          phone_verified: true,
          gender: gender || null,
          dob: dob || null,
        },
      })

    if (createError || !created.user) {
      logger.error('Register createUser failed', { createError, email })
      const message = createError?.message || 'Failed to create account'
      if (message.toLowerCase().includes('already')) {
        return NextResponse.json(
          {
            error: 'An account with this email already exists',
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
        gender: gender || null,
        dob: dob || null,
        // Phone OTP is the ownership check; email is not OTP-verified.
        email_verified: false,
      })
    } catch (profileError) {
      logger.error('Register profile sync failed', {
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

    return NextResponse.json({
      success: true,
      user: {
        id: created.user.id,
        email,
        full_name: fullName,
        phone,
      },
    })
  } catch (error) {
    logger.error('Register failed', { error })
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Something went wrong',
      },
      { status: 500 }
    )
  }
}
