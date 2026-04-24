import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaymentIntent } from '@/lib/stripe'
import { paymentRateLimit } from '@/lib/rate-limit'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
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
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { order_id } = parsed.data

    // Verify order belongs to user
    const { data: order } = await supabase
      .from('orders')
      .select('id, total, status, payment_status, shipping_address, user:users(full_name, email)')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.payment_status === 'completed') {
      return NextResponse.json({ error: 'Order already paid' }, { status: 400 })
    }

    // Check if there's an existing payment intent
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('order_id', order_id)
      .eq('payment_method', 'stripe')
      .eq('status', 'pending')
      .single()

    if (existingPayment?.stripe_payment_intent_id) {
      // Retrieve existing intent
      const { stripe } = await import('@/lib/stripe')
      const intent = await stripe.paymentIntents.retrieve(existingPayment.stripe_payment_intent_id)
      if (intent.status !== 'canceled') {
        return NextResponse.json({ client_secret: intent.client_secret })
      }
    }

    // Build shipping details for Indian export compliance
    const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
    const shipping = order.shipping_address as any
    const shippingDetails = shipping ? {
      name: orderUser?.full_name || shipping.full_name || 'Customer',
      address: {
        line1: shipping.address_line1 || shipping.street || '',
        line2: shipping.address_line2 || '',
        city: shipping.city || '',
        state: shipping.state || '',
        postal_code: shipping.postal_code || shipping.zip || '',
        country: shipping.country || 'India',
      },
    } : undefined

    // Create new payment intent
    const paymentIntent = await createPaymentIntent(order.total, 'usd', {
      order_id,
      user_id: user.id,
    }, shippingDetails)

    // Store payment record
    await supabase.from('payments').insert({
      order_id,
      payment_method: 'stripe',
      status: 'pending',
      amount: order.total,
      currency: 'usd',
      stripe_payment_intent_id: paymentIntent.id,
      metadata: { order_id },
    })

    logger.info('Payment intent created', { orderId: order_id, intentId: paymentIntent.id })

    return NextResponse.json({ client_secret: paymentIntent.client_secret })
  } catch (error) {
    logger.error('Payment intent creation error', { error })
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}
