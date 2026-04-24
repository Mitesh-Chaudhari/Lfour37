import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendNewsletterConfirmationEmail } from '@/lib/email'
import { apiRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  const rateLimitRes = apiRateLimit(request)
  if (rateLimitRes) return rateLimitRes

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const { email } = parsed.data
    const supabase = await createClient()

    const { error } = await supabase
      .from('newsletter_subscribers')
      .upsert({ email, is_active: true }, { onConflict: 'email' })

    if (error) {
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
    }

    // Also update user if logged in
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('users').update({ newsletter_subscribed: true }).eq('id', user.id)
    }

    sendNewsletterConfirmationEmail(email).catch(() => {})

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
