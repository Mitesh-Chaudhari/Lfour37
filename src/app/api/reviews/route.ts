import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const schema = z.object({
  product_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
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

    const data = parsed.data

    // Check if user already reviewed this product
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('product_id', data.product_id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'You have already reviewed this product' }, { status: 400 })
    }

    // Verified purchase: paid order, or COD that was delivered
    const { data: purchaseRows } = await supabase
      .from('order_items')
      .select(
        'id, order:orders!inner(id, user_id, payment_status, status, payment_method)'
      )
      .eq('product_id', data.product_id)
      .eq('orders.user_id', user.id)
      .limit(10)

    const purchase = (purchaseRows || []).find((row) => {
      const orderRow = Array.isArray(row.order) ? row.order[0] : row.order
      if (!orderRow) return false
      if (orderRow.payment_status === 'completed') return true
      return (
        orderRow.payment_method === 'cod' &&
        ['delivered', 'exchanged', 'returned'].includes(orderRow.status)
      )
    })

    const orderId =
      (purchase?.order as { id?: string } | null)?.id ||
      (Array.isArray(purchase?.order) ? purchase?.order[0]?.id : null) ||
      null

    const { error } = await supabase.from('reviews').insert({
      product_id: data.product_id,
      user_id: user.id,
      order_id: orderId,
      rating: data.rating,
      title: data.title || null,
      body: data.body || null,
      status: 'pending',
      is_verified_purchase: Boolean(purchase),
    })

    if (error) {
      return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Review submitted for moderation' }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
