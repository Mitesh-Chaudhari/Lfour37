import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { authRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  const rateLimitRes = authRateLimit(req)
  if (rateLimitRes) return rateLimitRes

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ verified: false })
    }

    const email = parsed.data.email.trim().toLowerCase()
    const supabase = createAdminClient()

    const { data } = await supabase
      .from('verified_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle()

    return NextResponse.json({ verified: Boolean(data) })
  } catch {
    return NextResponse.json({ verified: false })
  }
}
