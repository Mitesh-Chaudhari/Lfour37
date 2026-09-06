import { createAdminClient } from '@/lib/supabase/server'
import { createRazorpayOrder } from '@/lib/razorpay'
import { buildCodPrepaidPaymentUrl } from '@/lib/cod-prepaid-token'
import { notifyCodPrepaidOffer } from '@/lib/whatsapp/cod-prepaid'
import logger from '@/lib/logger'

export const COD_PREPAID_OFFER_DISCOUNT_PERCENT = 10
export const COD_PREPAID_OFFER_DURATION_MS = 45 * 60 * 1000

type OrderRow = {
  id: string
  order_number: string
  total: number
  payment_method: string
  status: string
  user_id: string
  shipping_address: Record<string, unknown> | null
}

export type CodPrepaidInitiateResult =
  | {
      ok: true
      offer_id: string
      razorpay_order_id: string
      discounted_total: number
      original_total: number
      savings_amount: number
      expires_at: string
      order_number?: string
      already_exists?: boolean
    }
  | { ok: false; status: number; error: string }

function getPhone(address: Record<string, unknown> | null): string | null {
  if (!address) return null
  const phone = address.phone || address.mobile || address.contact
  return typeof phone === 'string' ? phone.trim() || null : null
}

function getCustomerName(address: Record<string, unknown> | null): string {
  if (!address) return 'Customer'
  const name = address.name || address.full_name
  return typeof name === 'string' && name.trim() ? name.trim() : 'Customer'
}

/**
 * Create (or return existing) COD → Prepaid conversion offer.
 * Caller must authorize before invoking.
 */
export async function initiateCodPrepaidOffer(
  orderId: string
): Promise<CodPrepaidInitiateResult> {
  const admin = createAdminClient()

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select(
      'id, order_number, total, payment_method, status, user_id, shipping_address'
    )
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return { ok: false, status: 404, error: 'Order not found' }
  }

  const typedOrder = order as OrderRow

  if (typedOrder.payment_method !== 'cod') {
    return {
      ok: false,
      status: 400,
      error: 'Only COD orders are eligible for prepaid conversion',
    }
  }

  if (!['processing', 'pending'].includes(typedOrder.status)) {
    return {
      ok: false,
      status: 400,
      error: 'Order is not in an eligible status for conversion',
    }
  }

  const { data: existing } = await admin
    .from('cod_prepaid_offers')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existing && existing.offer_status === 'pending') {
    return {
      ok: true,
      offer_id: existing.id,
      razorpay_order_id: existing.razorpay_order_id,
      discounted_total: existing.discounted_total,
      original_total: existing.original_total,
      savings_amount:
        Number(existing.original_total) - Number(existing.discounted_total),
      expires_at: existing.expires_at,
      order_number: typedOrder.order_number,
      already_exists: true,
    }
  }

  const originalTotal = Number(typedOrder.total)
  const discountedTotal =
    Math.round(
      originalTotal * (1 - COD_PREPAID_OFFER_DISCOUNT_PERCENT / 100) * 100
    ) / 100
  const savingsAmount =
    Math.round((originalTotal - discountedTotal) * 100) / 100
  const expiresAt = new Date(Date.now() + COD_PREPAID_OFFER_DURATION_MS)

  const razorpayOrder = await createRazorpayOrder(
    discountedTotal,
    `cod-prepaid-${orderId}`
  )

  const paymentUrl = buildCodPrepaidPaymentUrl(orderId, expiresAt)

  const { data: offer, error: offerError } = await admin
    .from('cod_prepaid_offers')
    .insert({
      order_id: orderId,
      original_total: originalTotal,
      discounted_total: discountedTotal,
      discount_percent: COD_PREPAID_OFFER_DISCOUNT_PERCENT,
      razorpay_order_id: razorpayOrder.id,
      offer_status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (offerError || !offer) {
    logger.error('Failed to create COD prepaid offer', {
      offerError,
      order_id: orderId,
    })
    return { ok: false, status: 500, error: 'Failed to create offer' }
  }

  const phone = getPhone(typedOrder.shipping_address)
  const customerName = getCustomerName(typedOrder.shipping_address)

  if (phone) {
    notifyCodPrepaidOffer({
      phone,
      userId: typedOrder.user_id,
      orderId,
      orderNumber: typedOrder.order_number,
      customerName,
      originalTotal,
      discountedTotal,
      savingsAmount,
      paymentUrl,
    }).catch((err) =>
      logger.error('COD prepaid offer WhatsApp failed (non-fatal)', {
        err,
        order_id: orderId,
      })
    )
  }

  logger.info('COD prepaid offer created', {
    order_id: orderId,
    offer_id: offer.id,
    discountedTotal,
    expiresAt,
  })

  return {
    ok: true,
    offer_id: offer.id,
    razorpay_order_id: razorpayOrder.id,
    discounted_total: discountedTotal,
    original_total: originalTotal,
    savings_amount: savingsAmount,
    expires_at: expiresAt.toISOString(),
    order_number: typedOrder.order_number,
  }
}
