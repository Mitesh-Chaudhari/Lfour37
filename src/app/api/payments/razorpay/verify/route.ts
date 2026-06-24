import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ensureDelhiveryShipmentForPaidOrder } from '@/lib/delhivery-shipping'
import { sendOrderConfirmationEmail, sendNewOrderOwnerNotificationEmail } from '@/lib/email'
import { notifyOrderConfirmation } from '@/lib/whatsapp/order-notifications'
import logger from '@/lib/logger'
import { fetchRazorpayPayment } from '@/lib/razorpay'
import { z } from 'zod'

const schema = z.object({
  razorpay_payment_id: z.string().min(1),
  order_id: z.string().uuid(),
  razorpay_order_id: z.string().min(1).optional(),
  razorpay_signature: z.string().min(1).optional(),
})

function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean {
  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')

  try {
    const expected = Buffer.from(generatedSignature, 'hex')
    const received = Buffer.from(razorpaySignature, 'hex')
    return (
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
    )
  } catch {
    return false
  }
}

async function resolveVerifiedRazorpayOrderId(
  razorpayPaymentId: string,
  razorpayOrderId?: string,
  razorpaySignature?: string
): Promise<string> {
  if (razorpayOrderId && razorpaySignature) {
    if (
      !verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      )
    ) {
      throw new Error('INVALID_SIGNATURE')
    }
    return razorpayOrderId
  }

  const payment = await fetchRazorpayPayment(razorpayPaymentId)

  if (!['captured', 'authorized'].includes(payment.status)) {
    throw new Error('PAYMENT_NOT_CAPTURED')
  }

  if (!payment.order_id) {
    throw new Error('PAYMENT_MISSING_ORDER')
  }

  return payment.order_id
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      logger.warn('Razorpay verify validation failed', {
        issues: parsed.error.issues,
        receivedKeys: Object.keys(body || {}),
      })
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const {
      razorpay_order_id: clientRazorpayOrderId,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
    } = parsed.data

    let verifiedRazorpayOrderId: string
    try {
      verifiedRazorpayOrderId = await resolveVerifiedRazorpayOrderId(
        razorpay_payment_id,
        clientRazorpayOrderId,
        razorpay_signature
      )
    } catch (error) {
      const code = error instanceof Error ? error.message : 'VERIFY_FAILED'
      if (code === 'INVALID_SIGNATURE') {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }
      if (code === 'PAYMENT_NOT_CAPTURED') {
        return NextResponse.json(
          { error: 'Payment is not completed yet' },
          { status: 400 }
        )
      }
      if (code === 'PAYMENT_MISSING_ORDER') {
        return NextResponse.json(
          { error: 'Payment is not linked to a Razorpay order' },
          { status: 400 }
        )
      }
      logger.error('Razorpay payment resolution failed', { error, order_id })
      return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
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

    const admin = createAdminClient()

    const { data: payment, error: paymentLookupError } = await admin
      .from('payments')
      .select('id, razorpay_order_id, amount, status')
      .eq('order_id', order_id)
      .eq('razorpay_order_id', verifiedRazorpayOrderId)
      .maybeSingle()

    if (paymentLookupError) {
      logger.error('Failed to load Razorpay payment record', {
        paymentLookupError,
        orderId: order_id,
        razorpayOrderId: verifiedRazorpayOrderId,
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
      admin
        .from('orders')
        .update({ status: 'paid', payment_status: 'completed' })
        .eq('id', order_id),
      admin
        .from('payments')
        .update({
          status: 'completed',
          razorpay_payment_id,
          razorpay_order_id: verifiedRazorpayOrderId,
        })
        .eq('id', payment.id),
    ])

    await admin.from('order_tracking').insert({
      order_id,
      status: 'placed',
      description: 'Order placed successfully',
    })

    const shipment = await ensureDelhiveryShipmentForPaidOrder(order_id)

    const { data: updatedOrder } = await admin
      .from('orders')
      .select('tracking_number')
      .eq('id', order_id)
      .single()

    const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
    const confirmedOrder = {
      ...order,
      status: 'paid',
      payment_status: 'completed',
      tracking_number:
        updatedOrder?.tracking_number || order.tracking_number,
    }

    sendNewOrderOwnerNotificationEmail(
      confirmedOrder as typeof order,
      orderUser?.email
    ).catch((error) =>
      logger.error('Owner new order notification failed', {
        error,
        orderId: order_id,
      })
    )

    if (orderUser?.email) {
      sendOrderConfirmationEmail(
        confirmedOrder,
        orderUser.email
      ).catch((error) =>
        logger.error('Razorpay order confirmation email failed', {
          error,
          orderId: order_id,
        })
      )
    }

    notifyOrderConfirmation({
      id: order.id,
      order_number: order.order_number,
      total: order.total,
      created_at: order.created_at,
      user_id: order.user_id,
      shipping_address: order.shipping_address,
      items: order.items,
    }).catch((error) =>
      logger.error('Razorpay order confirmation WhatsApp failed', {
        error,
        orderId: order_id,
      })
    )

    return NextResponse.json({ success: true, shipment })
  } catch (error) {
    logger.error('Razorpay verification failed', { error })
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
