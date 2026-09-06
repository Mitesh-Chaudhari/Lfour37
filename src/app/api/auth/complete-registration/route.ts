import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { confirmAuthEmail, syncUserProfile } from '@/lib/auth-users'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1).optional(),
  phone: z.string().min(10).max(15).optional(),
  gender: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = schema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const data = parsed.data

    if (data.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (data.email.trim().toLowerCase() !== (user.email || '').toLowerCase()) {
      return NextResponse.json({ error: 'Email mismatch' }, { status: 403 })
    }

    // Only confirm the authenticated user's email; never trust client phone_verified.
    await confirmAuthEmail(data.user_id)

    await syncUserProfile({
      user_id: data.user_id,
      email: data.email,
      full_name: data.full_name,
      phone: data.phone,
      gender: data.gender,
      dob: data.dob,
      email_verified: false,
      phone_verified: false,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Complete registration failed', { error })
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not create user profile',
      },
      { status: 500 }
    )
  }
}
