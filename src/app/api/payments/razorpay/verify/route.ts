import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { ensureDelhiveryShipmentForPaidOrder } from '@/lib/delhivery-shipping'
import { sendOrderConfirmationEmail } from '@/lib/email'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
  order_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
    } = parsed.data

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')
    const expected = Buffer.from(generatedSignature, 'hex')
    const received = Buffer.from(razorpay_signature, 'hex')

    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const { data: order } = await supabase
      .from('orders')
      .select('*, items:order_items(*), user:users(email)')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.payment_status === 'completed') {
      const shipment = await ensureDelhiveryShipmentForPaidOrder(order_id)
      return NextResponse.json({ success: true, shipment })
    }

    const { data: payment, error: paymentLookupError } = await supabase
      .from('payments')
      .select('id, razorpay_order_id, amount, status')
      .eq('order_id', order_id)
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle()

    if (paymentLookupError) {
      logger.error('Failed to load Razorpay payment record', {
        paymentLookupError,
        orderId: order_id,
        razorpayOrderId: razorpay_order_id,
      })
      return NextResponse.json(
        { error: 'Could not load payment record' },
        { status: 500 }
      )
    }

    if (!payment) {
      return NextResponse.json(
        {
          error:
            'Payment record not found for this order. Run the Razorpay database migration and create a new checkout.',
        },
        { status: 400 }
      )
    }

    if (Number(payment.amount) !== Number(order.total)) {
      return NextResponse.json(
        { error: 'Payment amount does not match this order' },
        { status: 400 }
      )
    }

    await Promise.all([
      supabase
        .from('orders')
        .update({ status: 'paid', payment_status: 'completed' })
        .eq('id', order_id),
      supabase
        .from('payments')
        .update({
          status: 'completed',
          razorpay_payment_id,
          razorpay_order_id,
        })
        .eq('id', payment.id),
    ])

    await supabase.from('order_tracking').insert({
      order_id,
      status: 'placed',
      description: 'Order placed successfully',
    })

    const shipment = await ensureDelhiveryShipmentForPaidOrder(order_id)

    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('tracking_number')
      .eq('id', order_id)
      .single()

    const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
    if (orderUser?.email) {
      sendOrderConfirmationEmail(
        {
          ...order,
          status: 'paid',
          payment_status: 'completed',
          tracking_number:
            updatedOrder?.tracking_number || order.tracking_number,
        },
        orderUser.email
      ).catch((error) =>
        logger.error('Razorpay order confirmation email failed', {
          error,
          orderId: order_id,
        })
      )
    }

    return NextResponse.json({ success: true, shipment })
  } catch (error) {
    logger.error('Razorpay verification failed', { error })
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
