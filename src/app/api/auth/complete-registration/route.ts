import { NextRequest, NextResponse } from 'next/server'
import { syncUserProfile } from '@/lib/auth-users'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1).optional(),
  phone: z.string().min(10).max(15).optional(),
  phone_verified: z.boolean().optional(),
  gender: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    await syncUserProfile(parsed.data)

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
