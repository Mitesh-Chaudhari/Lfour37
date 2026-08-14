/** Unpaid checkout orders can be resumed for this window, then auto-cancelled. */
export const PENDING_PAYMENT_WINDOW_MS = 30 * 60 * 1000

export const PENDING_PAYMENT_CANCEL_REASON =
  'Order auto cancelled after 30 minutes'

export type PendingPaymentOrderLike = {
  id: string
  status?: string | null
  payment_method?: string | null
  payment_status?: string | null
  created_at?: string | null
  total?: number | null
  shipping_amount?: number | null
  cod_advance_amount?: number | null
  cod_collect_amount?: number | null
}

export type PendingPaymentLike = {
  payment_method?: string | null
  status?: string | null
  amount?: number | null
}

export function getOnlineChargeAmount(order: PendingPaymentOrderLike): number {
  if (order.payment_method === 'cod') {
    return Number(order.cod_advance_amount ?? order.shipping_amount ?? 0)
  }
  return Number(order.total || 0)
}

export function requiresOnlineCheckoutPayment(
  order: PendingPaymentOrderLike
): boolean {
  if (order.payment_method === 'razorpay') return true
  if (order.payment_method === 'cod') {
    return getOnlineChargeAmount(order) > 0
  }
  return false
}

export function hasCompletedRazorpayPayment(
  payments: PendingPaymentLike[] | null | undefined
): boolean {
  return (payments || []).some(
    (payment) =>
      payment.payment_method === 'razorpay' && payment.status === 'completed'
  )
}

/** Order created but online payment (full or Partial COD advance) not completed. */
export function isUnpaidPendingCheckoutOrder(
  order: PendingPaymentOrderLike,
  payments?: PendingPaymentLike[] | null
): boolean {
  if (order.status !== 'pending') return false
  if (!requiresOnlineCheckoutPayment(order)) return false

  if (order.payment_method === 'cod') {
    return !hasCompletedRazorpayPayment(payments)
  }

  return order.payment_status !== 'completed'
}

export function getPendingPaymentAgeMs(
  order: PendingPaymentOrderLike,
  nowMs = Date.now()
): number {
  if (!order.created_at) return Number.POSITIVE_INFINITY
  const created = new Date(order.created_at).getTime()
  if (Number.isNaN(created)) return Number.POSITIVE_INFINITY
  return Math.max(0, nowMs - created)
}

export function canResumePendingPayment(
  order: PendingPaymentOrderLike,
  payments?: PendingPaymentLike[] | null,
  nowMs = Date.now()
): boolean {
  if (!isUnpaidPendingCheckoutOrder(order, payments)) return false
  return getPendingPaymentAgeMs(order, nowMs) < PENDING_PAYMENT_WINDOW_MS
}

export function shouldAutoCancelUnpaidPendingOrder(
  order: PendingPaymentOrderLike,
  payments?: PendingPaymentLike[] | null,
  nowMs = Date.now()
): boolean {
  if (!isUnpaidPendingCheckoutOrder(order, payments)) return false
  return getPendingPaymentAgeMs(order, nowMs) >= PENDING_PAYMENT_WINDOW_MS
}

export function getPendingPaymentExpiresAt(
  order: PendingPaymentOrderLike
): Date | null {
  if (!order.created_at) return null
  const created = new Date(order.created_at).getTime()
  if (Number.isNaN(created)) return null
  return new Date(created + PENDING_PAYMENT_WINDOW_MS)
}
