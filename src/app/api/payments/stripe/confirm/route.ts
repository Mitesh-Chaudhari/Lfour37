import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { retrievePaymentIntent } from '@/lib/stripe'
import { sendOrderConfirmationEmail } from '@/lib/email'
import logger from '@/lib/logger'
import { z } from 'zod'
import { createDelhiveryShipmentForOrder } from '@/lib/delhivery-shipping'

const schema = z.object({
  payment_intent_id: z.string(),
  order_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
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

    const { payment_intent_id, order_id } = parsed.data

    // Verify order belongs to user
    const { data: order } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Verify payment with Stripe
    const paymentIntent = await retrievePaymentIntent(payment_intent_id)

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment not successful' }, { status: 400 })
    }

    // Verify amount matches
    const expectedAmountCents = Math.round(order.total * 100)
    if (paymentIntent.amount !== expectedAmountCents) {
      logger.error('Payment amount mismatch', {
        expected: expectedAmountCents,
        received: paymentIntent.amount,
        orderId: order_id,
      })
      return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 })
    }

    // Update order and payment status
    await Promise.all([
      supabase
        .from('orders')
        .update({ status: 'paid', payment_status: 'completed' })
        .eq('id', order_id),

      supabase
        .from('payments')
        .update({
          status: 'completed',
          stripe_charge_id: paymentIntent.latest_charge as string,
        })
        .eq('stripe_payment_intent_id', payment_intent_id),
    ])

    // Log analytics
    await supabase.from('analytics_events').insert({
      event_type: 'payment_completed',
      user_id: user.id,
      order_id,
      properties: { payment_method: 'stripe', amount: order.total },
    })

    try {
      await createDelhiveryShipmentForOrder(order_id)
    } catch (error) {
      logger.error('Delhivery shipment creation failed after Stripe payment', {
        error,
        orderId: order_id,
      })
    }

    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('tracking_number')
      .eq('id', order_id)
      .single()

    sendOrderConfirmationEmail(
      {
        ...order,
        status: 'paid',
        payment_status: 'completed',
        tracking_number: updatedOrder?.tracking_number || order.tracking_number,
      },
      user.email ?? ''
    ).catch((err) =>
      logger.error('Failed to send order email', { err, orderId: order_id })
    )

    logger.info('Payment confirmed', { orderId: order_id, intentId: payment_intent_id })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Payment confirmation error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
