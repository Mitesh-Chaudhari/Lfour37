import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(8),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Email and OTP are required' },
        { status: 400 }
      )
    }

    const email = parsed.data.email.trim().toLowerCase()
    const otp = parsed.data.otp.trim()
    const supabase = createAdminClient()

    const { data } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .eq('otp', otp)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
    }

    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: 'OTP expired' }, { status: 400 })
    }

    await supabase
      .from('email_otps')
      .update({ verified: true })
      .eq('id', data.id)

    await supabase.from('verified_emails').upsert({
      email,
      verified_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Verify email OTP failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    )
  }
}
