/**
 * POST /api/payments/cod-to-prepaid/initiate
 *
 * Creates (or returns existing) a COD → Prepaid conversion offer for a COD order.
 * Called immediately after a COD order is placed.
 * - Creates the offer record (45 min expiry)
 * - Creates a Razorpay order for the discounted amount
 * - Sends the first WhatsApp offer message
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createRazorpayOrder } from '@/lib/razorpay'
import { buildCodPrepaidPaymentUrl } from '@/lib/cod-prepaid-token'
import { notifyCodPrepaidOffer } from '@/lib/whatsapp/cod-prepaid'
import logger from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const OFFER_DISCOUNT_PERCENT = 10
const OFFER_DURATION_MS = 45 * 60 * 1000 // 45 minutes

const schema = z.object({
  order_id: z.string().uuid(),
})

type OrderRow = {
  id: string
  order_number: string
  total: number
  payment_method: string
  status: string
  user_id: string
  shipping_address: Record<string, unknown> | null
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { order_id } = parsed.data
    const admin = createAdminClient()

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_number, total, payment_method, status, user_id, shipping_address')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const typedOrder = order as OrderRow

    if (typedOrder.payment_method !== 'cod') {
      return NextResponse.json(
        { error: 'Only COD orders are eligible for prepaid conversion' },
        { status: 400 }
      )
    }

    if (!['processing', 'pending'].includes(typedOrder.status)) {
      return NextResponse.json(
        { error: 'Order is not in an eligible status for conversion' },
        { status: 400 }
      )
    }

    // Return existing active offer if one already exists
    const { data: existing } = await admin
      .from('cod_prepaid_offers')
      .select('*')
      .eq('order_id', order_id)
      .maybeSingle()

    if (existing && existing.offer_status === 'pending') {
      return NextResponse.json({
        success: true,
        offer_id: existing.id,
        razorpay_order_id: existing.razorpay_order_id,
        discounted_total: existing.discounted_total,
        original_total: existing.original_total,
        expires_at: existing.expires_at,
        already_exists: true,
      })
    }

    const originalTotal = Number(typedOrder.total)
    const discountedTotal = Math.round(originalTotal * (1 - OFFER_DISCOUNT_PERCENT / 100) * 100) / 100
    const savingsAmount = Math.round((originalTotal - discountedTotal) * 100) / 100
    const expiresAt = new Date(Date.now() + OFFER_DURATION_MS)

    // Create Razorpay order for the discounted amount
    const razorpayOrder = await createRazorpayOrder(
      discountedTotal,
      `cod-prepaid-${order_id}`
    )

    const paymentUrl = buildCodPrepaidPaymentUrl(order_id, expiresAt)

    const { data: offer, error: offerError } = await admin
      .from('cod_prepaid_offers')
      .insert({
        order_id,
        original_total: originalTotal,
        discounted_total: discountedTotal,
        discount_percent: OFFER_DISCOUNT_PERCENT,
        razorpay_order_id: razorpayOrder.id,
        offer_status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (offerError || !offer) {
      logger.error('Failed to create COD prepaid offer', { offerError, order_id })
      return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 })
    }

    // Fire-and-forget WhatsApp
    const phone = getPhone(typedOrder.shipping_address as Record<string, unknown> | null)
    const customerName = getCustomerName(typedOrder.shipping_address as Record<string, unknown> | null)

    if (phone) {
      notifyCodPrepaidOffer({
        phone,
        userId: typedOrder.user_id,
        orderId: order_id,
        orderNumber: typedOrder.order_number,
        customerName,
        originalTotal,
        discountedTotal,
        savingsAmount,
        paymentUrl,
      }).catch((err) =>
        logger.error('COD prepaid offer WhatsApp failed (non-fatal)', { err, order_id })
      )
    }

    logger.info('COD prepaid offer created', {
      order_id,
      offer_id: offer.id,
      discountedTotal,
      expiresAt,
    })

    return NextResponse.json({
      success: true,
      offer_id: offer.id,
      razorpay_order_id: razorpayOrder.id,
      discounted_total: discountedTotal,
      original_total: originalTotal,
      savings_amount: savingsAmount,
      expires_at: expiresAt.toISOString(),
    })
  } catch (error) {
    logger.error('COD prepaid initiate failed', { error })
    return NextResponse.json({ error: 'Failed to initiate offer' }, { status: 500 })
  }
}
