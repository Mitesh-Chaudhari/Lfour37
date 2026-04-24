import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRefund } from '@/lib/stripe'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { order_id, amount, reason } = await req.json()
    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

    // Get order and payment
    const { data: order } = await supabase
      .from('orders')
      .select('*, payment:payments(*)')
      .eq('id', order_id)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const payment = Array.isArray(order.payment) ? order.payment[0] : order.payment
    if (!payment) return NextResponse.json({ error: 'No payment found for order' }, { status: 400 })

    if (order.payment_method === 'stripe') {
      if (!payment.stripe_payment_intent_id) {
        return NextResponse.json({ error: 'No Stripe payment intent found' }, { status: 400 })
      }

      const refund = await createRefund(
        payment.stripe_payment_intent_id,
        amount || undefined,
        reason || 'requested_by_customer'
      )

      // Update payment record
      await supabase
        .from('payments')
        .update({
          status: 'refunded',
          refund_id: refund.id,
          refunded_amount: (refund.amount / 100),
        })
        .eq('id', payment.id)

      // Update order status
      await supabase
        .from('orders')
        .update({ status: 'refunded', payment_status: 'refunded' })
        .eq('id', order_id)

      logger.info('Stripe refund processed', { order_id, refund_id: refund.id, amount: refund.amount })

      return NextResponse.json({ success: true, refund_id: refund.id })
    }

    if (order.payment_method === 'crypto') {
      // For crypto, we can only mark as manually refunded
      await supabase
        .from('payments')
        .update({ status: 'refunded', refunded_amount: amount || order.total })
        .eq('id', payment.id)

      await supabase
        .from('orders')
        .update({ status: 'refunded', payment_status: 'refunded' })
        .eq('id', order_id)

      logger.info('Crypto refund marked', { order_id })

      return NextResponse.json({ success: true, message: 'Order marked as refunded. Process crypto refund manually.' })
    }

    return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 })
  } catch (error) {
    logger.error('Refund error', { error })
    return NextResponse.json({ error: 'Failed to process refund' }, { status: 500 })
  }
}
