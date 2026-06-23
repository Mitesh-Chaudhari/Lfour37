import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { createRazorpayOrder } from '@/lib/razorpay'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
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

    const { order_id } = parsed.data

    const { data: order } = await supabase
      .from('orders')
      .select('id, total, payment_status')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const admin = createAdminClient()

    const { data: existingPayment } = await admin
      .from('payments')
      .select('razorpay_order_id, amount')
      .eq('order_id', order_id)
      .eq('payment_method', 'razorpay')
      .eq('status', 'pending')
      .not('razorpay_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingPayment?.razorpay_order_id) {
      return NextResponse.json({
        id: existingPayment.razorpay_order_id,
        amount: Math.round(Number(existingPayment.amount) * 100),
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
      })
    }

    const razorpayOrder = await createRazorpayOrder(order.total, order_id)

    const { error: paymentError } = await admin.from('payments').insert({
      order_id,
      payment_method: 'razorpay',
      status: 'pending',
      amount: order.total,
      currency: 'INR',
      razorpay_order_id: razorpayOrder.id,
    })

    if (paymentError) {
      logger.error('Failed to save Razorpay payment record', {
        paymentError,
        orderId: order_id,
        razorpayOrderId: razorpayOrder.id,
      })

      const hint = paymentError.message?.includes('razorpay')
        ? 'Apply database migration 005_razorpay_payments.sql'
        : undefined

      return NextResponse.json(
        {
          error: 'Failed to save payment record',
          ...(hint ? { hint } : {}),
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error) {
    logger.error('Razorpay create-order failed', { error })
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
