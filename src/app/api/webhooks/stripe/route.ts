import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendNewOrderOwnerNotificationEmail,
  sendOrderConfirmationEmail,
} from '@/lib/email'
import { notifyOrderConfirmation } from '@/lib/whatsapp/order-notifications'
import { markAbandonedCartRecovered } from '@/lib/abandoned-cart'
import logger from '@/lib/logger'
import { createDelhiveryShipmentForOrder } from '@/lib/delhivery-shipping'
import { queueErpNextOrderSync } from '@/lib/erpnext/sync-order'

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

          const { data: order } = await supabase
            .from('orders')
            .select('*, items:order_items(*), user:users(email)')
            .eq('id', orderId)
            .single()

          if (order) {
            const orderUser = Array.isArray(order.user)
              ? order.user[0]
              : order.user
            const confirmedOrder = {
              ...order,
              status: 'paid',
              payment_status: 'completed',
            }

            await Promise.all([
              sendNewOrderOwnerNotificationEmail(
                confirmedOrder,
                orderUser?.email
              ).catch((error) =>
                logger.error('Owner new order notification failed', {
                  error,
                  orderId,
                })
              ),
              orderUser?.email
                ? sendOrderConfirmationEmail(
                    confirmedOrder,
                    orderUser.email
                  ).catch((error) =>
                    logger.error(
                      'Stripe webhook order confirmation email failed',
                      { error, orderId }
                    )
                  )
                : Promise.resolve(),
              notifyOrderConfirmation({
                id: order.id,
                order_number: order.order_number,
                total: order.total,
                created_at: order.created_at,
                user_id: order.user_id,
                shipping_address: order.shipping_address,
                items: order.items,
              }).catch((error) =>
                logger.error(
                  'Stripe webhook order confirmation WhatsApp failed',
                  { error, orderId }
                )
              ),
              order.user_id
                ? markAbandonedCartRecovered(supabase, order.user_id)
                : Promise.resolve(),
            ])
          }

          try {
            await createDelhiveryShipmentForOrder(orderId)
          } catch (error) {
            logger.error('Delhivery shipment creation failed from Stripe webhook', {
              error,
              orderId,
            })
          }

          await queueErpNextOrderSync(orderId)

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
            await queueErpNextOrderSync(payment.order_id)
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
