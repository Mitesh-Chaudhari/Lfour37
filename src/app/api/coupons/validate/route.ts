import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const schema = z.object({
  code: z.string().min(1).max(50).toUpperCase(),
  subtotal: z.number().min(0),
})

export async function POST(request: NextRequest) {
  const rateLimitRes = apiRateLimit(request)
  if (rateLimitRes) return rateLimitRes

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { code, subtotal } = parsed.data

    const { data: coupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single()

    if (!coupon) {
      return NextResponse.json({ error: 'Invalid coupon code' }, { status: 404 })
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This coupon has expired' }, { status: 400 })
    }

    if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
      return NextResponse.json({ error: 'This coupon has reached its usage limit' }, { status: 400 })
    }

    if (coupon.minimum_order_amount && subtotal < coupon.minimum_order_amount) {
      return NextResponse.json({
        error: `Minimum order amount of $${coupon.minimum_order_amount} required`,
      }, { status: 400 })
    }

    return NextResponse.json({ coupon })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
