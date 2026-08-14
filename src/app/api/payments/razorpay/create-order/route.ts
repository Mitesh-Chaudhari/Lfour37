import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { createRazorpayOrder, fetchRazorpayOrder } from '@/lib/razorpay'
import {
  canResumePendingPayment,
  getOnlineChargeAmount,
  isUnpaidPendingCheckoutOrder,
} from '@/lib/pending-payment'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
})

type PaymentRow = {
  id: string
  payment_method: string | null
  status: string | null
  amount: number | null
  razorpay_order_id: string | null
  created_at?: string | null
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
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { order_id } = parsed.data

    const { data: order } = await supabase
      .from('orders')
      .select(
        `
        id,
        total,
        status,
        payment_status,
        payment_method,
        created_at,
        cod_advance_amount,
        shipping_amount,
        payment:payments(
          id,
          payment_method,
          status,
          amount,
          razorpay_order_id,
          created_at
        )
      `
      )
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const payments: PaymentRow[] = Array.isArray(order.payment)
      ? (order.payment as PaymentRow[])
      : order.payment
        ? [order.payment as PaymentRow]
        : []

    if (!isUnpaidPendingCheckoutOrder(order, payments)) {
      return NextResponse.json(
        { error: 'This order is not awaiting online payment' },
        { status: 400 }
      )
    }

    if (!canResumePendingPayment(order, payments)) {
      return NextResponse.json(
        {
          error:
            'Payment window expired. This order was cancelled because payment was not completed within 30 minutes.',
          expired: true,
        },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const chargeAmount = getOnlineChargeAmount(order)

    if (!Number.isFinite(chargeAmount) || chargeAmount < 1) {
      return NextResponse.json(
        { error: 'Invalid payment amount for this order' },
        { status: 400 }
      )
    }

    const pendingRazorpay = [...payments]
      .filter(
        (payment) =>
          payment.payment_method === 'razorpay' &&
          payment.status === 'pending' &&
          payment.razorpay_order_id
      )
      .sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      )[0]

    if (pendingRazorpay?.razorpay_order_id) {
      try {
        const razorpayOrder = await fetchRazorpayOrder(
          pendingRazorpay.razorpay_order_id
        )
        const status = String(razorpayOrder.status || '')

        if (status === 'paid') {
          return NextResponse.json({
            already_paid: true,
            id: pendingRazorpay.razorpay_order_id,
            amount: Math.round(chargeAmount * 100),
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
          })
        }

        if (status === 'created' || status === 'attempted') {
          return NextResponse.json({
            id: pendingRazorpay.razorpay_order_id,
            amount: Math.round(
              Number(pendingRazorpay.amount ?? chargeAmount) * 100
            ),
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
          })
        }
      } catch (error) {
        logger.warn('Existing Razorpay order unusable; creating a new one', {
          error,
          orderId: order_id,
          razorpayOrderId: pendingRazorpay.razorpay_order_id,
        })
      }

      await admin
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', pendingRazorpay.id)
    }

    const razorpayOrder = await createRazorpayOrder(chargeAmount, order_id)

    const { error: paymentError } = await admin.from('payments').insert({
      order_id,
      payment_method: 'razorpay',
      status: 'pending',
      amount: chargeAmount,
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
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    )
  }
}
