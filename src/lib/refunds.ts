import { createAdminClient } from '@/lib/supabase/server'
import { createRefund } from '@/lib/stripe'
import { createRazorpayRefund } from '@/lib/razorpay'
import logger from '@/lib/logger'

type RefundItem = {
  id: string
  order_id: string
  product_name: string
  total_price: number
  refund_status: string | null
  refunded_amount: number | null
  return_type: string | null
  status: string | null
}

type RefundOrder = {
  id: string
  order_number: string
  total: number
  payment_method: string
  payment_status: string
  status: string
}

type RefundPayment = {
  id: string
  payment_method: string
  status: string
  amount: number
  stripe_payment_intent_id: string | null
  razorpay_payment_id: string | null
  refunded_amount: number | null
}

export async function syncOrderRefundStatus(orderId: string) {
  const supabase = createAdminClient()

  const { data: items } = await supabase
    .from('order_items')
    .select('id, refund_status')
    .eq('order_id', orderId)

  const { data: payment } = await supabase
    .from('payments')
    .select('refunded_amount, amount')
    .eq('order_id', orderId)
    .maybeSingle()

  const allItemsRefunded = Boolean(
    items?.length && items.every((item) => item.refund_status === 'completed')
  )

  const totalRefunded = Number(payment?.refunded_amount || 0)
  const paidAmount = Number(payment?.amount || 0)
  const fullyRefunded =
    allItemsRefunded || (paidAmount > 0 && totalRefunded >= paidAmount - 0.01)

  await supabase
    .from('payments')
    .update({
      status: fullyRefunded
        ? 'refunded'
        : totalRefunded > 0
          ? 'completed'
          : 'completed',
    })
    .eq('order_id', orderId)

  if (fullyRefunded) {
    await supabase
      .from('orders')
      .update({ status: 'refunded', payment_status: 'refunded' })
      .eq('id', orderId)
  }
}

export async function processItemRefund(itemId: string) {
  const supabase = createAdminClient()

  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .select(
      'id, order_id, product_name, total_price, refund_status, refunded_amount, return_type, status'
    )
    .eq('id', itemId)
    .single()

  if (itemError || !item) {
    throw new Error('Order item not found')
  }

  const refundItem = item as RefundItem

  if (refundItem.refund_status === 'completed') {
    throw new Error('This item has already been refunded')
  }

  if (refundItem.return_type === 'exchange') {
    throw new Error('Exchange items are not refundable')
  }

  if (refundItem.return_type === 'return' && refundItem.status !== 'returned') {
    throw new Error('Return refund is available only after product check')
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, total, payment_method, payment_status, status')
    .eq('id', refundItem.order_id)
    .single()

  if (orderError || !order) {
    throw new Error('Order not found')
  }

  const refundOrder = order as RefundOrder

  if (refundOrder.payment_method === 'cod') {
    await supabase
      .from('order_items')
      .update({
        refund_status: 'completed',
        refunded_amount: refundItem.total_price,
        refunded_at: new Date().toISOString(),
      })
      .eq('id', itemId)

    await syncOrderRefundStatus(refundOrder.id)
    return {
      mode: 'cod_manual' as const,
      amount: Number(refundItem.total_price),
      message: 'COD refund marked complete. Process cash/bank payout manually.',
    }
  }

  if (refundOrder.payment_status !== 'completed') {
    throw new Error('Refund is only available for paid orders')
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(
      'id, payment_method, status, amount, stripe_payment_intent_id, razorpay_payment_id, refunded_amount'
    )
    .eq('order_id', refundOrder.id)
    .eq('status', 'completed')
    .maybeSingle()

  if (paymentError || !payment) {
    throw new Error('No completed payment found for this order')
  }

  const refundPayment = payment as RefundPayment
  const refundAmount = Number(refundItem.total_price)
  const alreadyRefunded = Number(refundPayment.refunded_amount || 0)

  if (alreadyRefunded + refundAmount > Number(refundPayment.amount) + 0.01) {
    throw new Error('Refund amount exceeds paid amount')
  }

  await supabase
    .from('order_items')
    .update({ refund_status: 'processing' })
    .eq('id', itemId)

  try {
    let refundId: string | null = null

    if (refundOrder.payment_method === 'razorpay') {
      if (!refundPayment.razorpay_payment_id) {
        throw new Error('Razorpay payment ID is missing')
      }

      const refund = await createRazorpayRefund(
        refundPayment.razorpay_payment_id,
        refundAmount,
        {
          order_item_id: itemId,
          order_number: refundOrder.order_number,
          reason: 'return_or_cancellation',
        }
      )

      refundId = refund.id
    } else if (refundOrder.payment_method === 'stripe') {
      if (!refundPayment.stripe_payment_intent_id) {
        throw new Error('Stripe payment intent is missing')
      }

      const refund = await createRefund(
        refundPayment.stripe_payment_intent_id,
        refundAmount,
        'requested_by_customer'
      )

      refundId = refund.id
    } else if (refundOrder.payment_method === 'crypto') {
      refundId = `manual-crypto-${itemId}`
    } else {
      throw new Error(`Refunds are not supported for ${refundOrder.payment_method}`)
    }

    const totalRefunded = alreadyRefunded + refundAmount

    await supabase
      .from('order_items')
      .update({
        refund_status: 'completed',
        refunded_amount: refundAmount,
        refund_id: refundId,
        refunded_at: new Date().toISOString(),
        status:
          refundItem.return_type === 'exchange'
            ? refundItem.status
            : refundItem.status === 'cancelled'
              ? 'cancelled'
              : 'returned',
      })
      .eq('id', itemId)

    await supabase
      .from('payments')
      .update({
        refund_id: refundId,
        refunded_amount: totalRefunded,
        status: totalRefunded >= Number(refundPayment.amount) ? 'refunded' : 'completed',
      })
      .eq('id', refundPayment.id)

    await syncOrderRefundStatus(refundOrder.id)

    logger.info('Item refund processed', {
      itemId,
      orderId: refundOrder.id,
      amount: refundAmount,
      refundId,
    })

    return {
      mode: refundOrder.payment_method,
      amount: refundAmount,
      refundId,
      message:
        refundOrder.payment_method === 'crypto'
          ? 'Item marked refunded. Process crypto payout manually.'
          : 'Refund initiated successfully',
    }
  } catch (error) {
    await supabase
      .from('order_items')
      .update({ refund_status: 'failed' })
      .eq('id', itemId)
    throw error
  }
}

export async function processFullOrderRefund(orderId: string) {
  const supabase = createAdminClient()

  const { data: items } = await supabase
    .from('order_items')
    .select('id, refund_status')
    .eq('order_id', orderId)

  if (!items?.length) {
    throw new Error('No items found for this order')
  }

  const pendingItems = items.filter((item) => item.refund_status !== 'completed')

  if (!pendingItems.length) {
    throw new Error('All items are already refunded')
  }

  const results = []
  for (const item of pendingItems) {
    results.push(await processItemRefund(item.id))
  }

  return results
}
