import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent, createRefund } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { sendOrderStatusEmail } from '@/lib/email'
import logger from '@/lib/logger'

export async function POST(request: NextRequest) {
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event
  try {
    event = constructWebhookEvent(payload, signature)
  } catch (error) {
    logger.error('Webhook signature verification failed', { error })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        const orderId = paymentIntent.metadata?.order_id

        if (orderId) {
          await supabase
            .from('orders')
            .update({ status: 'paid', payment_status: 'completed' })
            .eq('id', orderId)
            .eq('payment_status', 'pending')

          await supabase
            .from('payments')
            .update({ status: 'completed', stripe_charge_id: paymentIntent.latest_charge as string })
            .eq('stripe_payment_intent_id', paymentIntent.id)

          // Send email
          const { data: order } = await supabase
            .from('orders')
            .select('*, items:order_items(*), user:users(email)')
            .eq('id', orderId)
            .single()

          if (order?.user?.email) {
            sendOrderConfirmationEmail(order, order.user.email).catch(() => {})
          }

          logger.info('Webhook: Payment succeeded', { orderId, intentId: paymentIntent.id })
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object
        const orderId = paymentIntent.metadata?.order_id

        if (orderId) {
          await supabase
            .from('payments')
            .update({ status: 'failed' })
            .eq('stripe_payment_intent_id', paymentIntent.id)

          logger.warn('Webhook: Payment failed', { orderId, intentId: paymentIntent.id })
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as { payment_intent?: string; amount_refunded?: number }
        if (charge.payment_intent) {
          await supabase
            .from('payments')
            .update({
              status: 'refunded',
              refunded_amount: (charge.amount_refunded || 0) / 100,
            })
            .eq('stripe_payment_intent_id', charge.payment_intent)

          // Update order status
          const { data: payment } = await supabase
            .from('payments')
            .select('order_id')
            .eq('stripe_payment_intent_id', charge.payment_intent)
            .single()

          if (payment?.order_id) {
            await supabase
              .from('orders')
              .update({ status: 'refunded', payment_status: 'refunded' })
              .eq('id', payment.order_id)
          }
        }
        break
      }

      default:
        logger.debug('Unhandled webhook event', { type: event.type })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('Webhook processing error', { error, eventType: event.type })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function sendOrderConfirmationEmail(order: { order_number: string; total: number; user?: { email?: string } }, email: string) {
  const { sendOrderConfirmationEmail: send } = await import('@/lib/email')
  return send(order as Parameters<typeof send>[0], email)
}
