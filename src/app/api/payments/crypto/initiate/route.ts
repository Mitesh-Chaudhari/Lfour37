import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { NETWORK_REQUIRED_CONFIRMATIONS } from '@/lib/crypto/contracts'
import { paymentRateLimit } from '@/lib/rate-limit'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
  network: z.enum(['ethereum', 'polygon', 'bsc', 'base']),
  token: z.enum(['USDT', 'USDC']),
  from_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  to_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.number().min(0.01),
})

export async function POST(request: NextRequest) {
  const rateLimitRes = paymentRateLimit(request)
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
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
    }

    const data = parsed.data

    // Verify order belongs to user
    const { data: order } = await supabase
      .from('orders')
      .select('id, total, payment_status')
      .eq('id', data.order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.payment_status === 'completed') {
      return NextResponse.json({ error: 'Order already paid' }, { status: 400 })
    }

    // Create payment record
    const { data: payment } = await supabase
      .from('payments')
      .insert({
        order_id: data.order_id,
        payment_method: 'crypto',
        status: 'pending',
        amount: order.total,
        currency: data.token,
        metadata: { network: data.network, token: data.token },
      })
      .select()
      .single()

    // Create crypto transaction record
    const { error: txError } = await supabase.from('crypto_transactions').insert({
      order_id: data.order_id,
      payment_id: payment?.id || null,
      network: data.network,
      token: data.token,
      from_address: data.from_address.toLowerCase(),
      to_address: data.to_address.toLowerCase(),
      amount: data.amount,
      usd_amount: order.total,
      status: 'pending',
      required_confirmations: NETWORK_REQUIRED_CONFIRMATIONS[data.network],
    })

    if (txError) {
      logger.error('Failed to create crypto transaction', { error: txError, orderId: data.order_id })
      return NextResponse.json({ error: 'Failed to initiate crypto payment' }, { status: 500 })
    }

    logger.info('Crypto payment initiated', {
      orderId: data.order_id,
      network: data.network,
      token: data.token,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Crypto initiate error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
