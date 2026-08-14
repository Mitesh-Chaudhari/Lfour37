import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PENDING_PAYMENT_CANCEL_REASON,
  PENDING_PAYMENT_WINDOW_MS,
  isUnpaidPendingCheckoutOrder,
  shouldAutoCancelUnpaidPendingOrder,
  type PendingPaymentLike,
  type PendingPaymentOrderLike,
} from '@/lib/pending-payment'
import logger from '@/lib/logger'

type CancelCandidate = PendingPaymentOrderLike & {
  payment?: PendingPaymentLike | PendingPaymentLike[] | null
}

function asPaymentList(
  payment: CancelCandidate['payment']
): PendingPaymentLike[] {
  if (!payment) return []
  return Array.isArray(payment) ? payment : [payment]
}

export async function cancelUnpaidPendingOrder(
  admin: SupabaseClient,
  order: CancelCandidate,
  reason = PENDING_PAYMENT_CANCEL_REASON
): Promise<{ cancelled: boolean; reason?: string }> {
  const payments = asPaymentList(order.payment)

  if (!isUnpaidPendingCheckoutOrder(order, payments)) {
    return { cancelled: false, reason: 'not_unpaid_pending' }
  }

  const cancelledAt = new Date().toISOString()

  const { data: updated, error: orderError } = await admin
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      cancel_reason: reason,
      notes: reason,
    })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (orderError) {
    logger.error('Failed to auto-cancel unpaid order', {
      orderError,
      orderId: order.id,
    })
    return { cancelled: false, reason: orderError.message }
  }

  if (!updated) {
    return { cancelled: false, reason: 'already_changed' }
  }

  await admin
    .from('order_items')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      cancel_custom_reason: reason,
    })
    .eq('order_id', order.id)
    .neq('status', 'cancelled')

  await admin
    .from('payments')
    .update({ status: 'failed' })
    .eq('order_id', order.id)
    .eq('status', 'pending')
    .eq('payment_method', 'razorpay')

  return { cancelled: true }
}

export async function cancelExpiredUnpaidOrders(
  admin: SupabaseClient,
  options?: { userId?: string; limit?: number; nowMs?: number }
): Promise<{ checked: number; cancelled: number; ids: string[] }> {
  const limit = Math.min(options?.limit ?? 100, 200)
  const nowMs = options?.nowMs ?? Date.now()
  const cutoffIso = new Date(nowMs - PENDING_PAYMENT_WINDOW_MS).toISOString()

  let query = admin
    .from('orders')
    .select(
      `
      id,
      status,
      payment_method,
      payment_status,
      created_at,
      total,
      shipping_amount,
      cod_advance_amount,
      payment:payments(payment_method, status, amount)
    `
    )
    .eq('status', 'pending')
    .eq('payment_status', 'pending')
    .lte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (options?.userId) {
    query = query.eq('user_id', options.userId)
  }

  const { data, error } = await query

  if (error) {
    logger.error('Failed to load unpaid pending orders for auto-cancel', {
      error,
    })
    throw error
  }

  const cancelledIds: string[] = []

  for (const order of data || []) {
    const payments = asPaymentList(order.payment)
    if (!shouldAutoCancelUnpaidPendingOrder(order, payments, nowMs)) {
      continue
    }

    const result = await cancelUnpaidPendingOrder(admin, order)
    if (result.cancelled) cancelledIds.push(order.id)
  }

  return {
    checked: data?.length || 0,
    cancelled: cancelledIds.length,
    ids: cancelledIds,
  }
}
