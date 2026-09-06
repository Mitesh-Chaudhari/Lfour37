/**
 * POST /api/payments/cod-to-prepaid/initiate
 *
 * Creates (or returns existing) a COD → Prepaid conversion offer for a COD order.
 * Authorized via:
 * - HMAC payment `token` (public pay page), or
 * - authenticated order owner session
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCodPrepaidToken } from '@/lib/cod-prepaid-token'
import { initiateCodPrepaidOffer } from '@/lib/cod-prepaid-initiate'
import logger from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  order_id: z.string().uuid(),
  token: z.string().min(10).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { order_id, token } = parsed.data

    let authorized = false

    if (token) {
      const payload = verifyCodPrepaidToken(token)
      authorized = Boolean(payload && payload.orderId === order_id)
    }

    if (!authorized) {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('id', order_id)
          .eq('user_id', user.id)
          .maybeSingle()
        authorized = Boolean(order)
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await initiateCodPrepaidOffer(order_id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      offer_id: result.offer_id,
      razorpay_order_id: result.razorpay_order_id,
      discounted_total: result.discounted_total,
      original_total: result.original_total,
      savings_amount: result.savings_amount,
      expires_at: result.expires_at,
      order_number: result.order_number,
      already_exists: result.already_exists,
    })
  } catch (error) {
    logger.error('COD prepaid initiate failed', { error })
    return NextResponse.json({ error: 'Failed to initiate offer' }, { status: 500 })
  }
}
