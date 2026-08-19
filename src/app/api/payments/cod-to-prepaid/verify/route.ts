/**
 * POST /api/payments/cod-to-prepaid/verify
 *
 * Called from the payment page after Razorpay succeeds.
 * No auth required — validated by signed token.
 *
 * Steps:
 * 1. Verify Razorpay signature
 * 2. Mark offer as accepted
 * 3. Apply 10% discount to order total
 * 4. Mark order as paid / prepaid
 * 5. Update Delhivery shipment → Prepaid, cod=0
 * 6. Send confirmation WhatsApp
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCodPrepaidToken } from '@/lib/cod-prepaid-token'
import { updateShipmentToPrepaid } from '@/lib/delhivery'
import { notifyCodPrepaidConfirmed } from '@/lib/whatsapp/cod-prepaid'
import { fetchRazorpayPayment } from '@/lib/razorpay'
import logger from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  token: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id: z.string().min(1).optional(),
  razorpay_signature: z.string().min(1).optional(),
})

function verifySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  sig: string
): boolean {
  try {
    const generated = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex')
    const a = Buffer.from(generated, 'hex')
    const b = Buffer.from(sig, 'hex')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function getPhone(address: Record<string, unknown> | null): string | null {
  if (!address) return null
  const phone = address.phone || address.mobile || address.contact
  return typeof phone === 'string' ? phone.trim() || null : null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { token, razorpay_payment_id, razorpay_order_id, razorpay_signature } = parsed.data

    // Verify token and extract orderId
    const tokenPayload = verifyCodPrepaidToken(token)
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Payment link has expired or is invalid' },
        { status: 400 }
      )
    }
    const { orderId } = tokenPayload

    const admin = createAdminClient()

    // Load offer
    const { data: offer } = await admin
      .from('cod_prepaid_offers')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle()

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (offer.offer_status === 'accepted') {
      return NextResponse.json({ success: true, already_converted: true })
    }

    if (['declined', 'expired'].includes(offer.offer_status)) {
      return NextResponse.json(
        { error: 'This offer is no longer valid' },
        { status: 400 }
      )
    }

    if (new Date(offer.expires_at) < new Date()) {
      await admin
        .from('cod_prepaid_offers')
        .update({ offer_status: 'expired' })
        .eq('id', offer.id)
      return NextResponse.json({ error: 'Offer has expired' }, { status: 400 })
    }

    // Verify Razorpay payment
    let verifiedRazorpayOrderId = razorpay_order_id
    if (razorpay_order_id && razorpay_signature) {
      if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
      }
    } else {
      const payment = await fetchRazorpayPayment(razorpay_payment_id)
      if (!['captured', 'authorized'].includes(String(payment.status))) {
        return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
      }
      verifiedRazorpayOrderId = payment.order_id as string
    }

    if (verifiedRazorpayOrderId !== offer.razorpay_order_id) {
      return NextResponse.json(
        { error: 'Payment does not match this offer' },
        { status: 400 }
      )
    }

    // Load order for later use
    const { data: order } = await admin
      .from('orders')
      .select('id, order_number, total, user_id, shipping_address, delhivery_shipment:delhivery_shipments(awb)')
      .eq('id', orderId)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const discountedTotal = Number(offer.discounted_total)
    const originalTotal = Number(offer.original_total)
    const savingsAmount = Math.round((originalTotal - discountedTotal) * 100) / 100

    // 1. Mark offer accepted
    await admin
      .from('cod_prepaid_offers')
      .update({ offer_status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', offer.id)

    // 2. Record payment row
    await admin.from('payments').insert({
      order_id: orderId,
      payment_method: 'razorpay',
      status: 'completed',
      amount: discountedTotal,
      currency: 'INR',
      razorpay_order_id: verifiedRazorpayOrderId,
      razorpay_payment_id,
    })

    // 3. Update order: apply discount, change payment method → prepaid, mark paid
    await admin
      .from('orders')
      .update({
        total: discountedTotal,
        payment_method: 'prepaid',
        payment_status: 'completed',
        status: 'processing',
        cod_advance_amount: 0,
        cod_collect_amount: 0,
        notes: `COD converted to Prepaid. 10% discount applied. Original total: ₹${originalTotal}.`,
      })
      .eq('id', orderId)

    // 4. Update Delhivery shipment to Prepaid
    const shipmentRaw = Array.isArray(order.delhivery_shipment)
      ? order.delhivery_shipment[0]
      : order.delhivery_shipment
    const awb = (shipmentRaw as { awb?: string } | null)?.awb

    if (awb) {
      try {
        await updateShipmentToPrepaid(awb)
        await admin
          .from('delhivery_shipments')
          .update({ payment_type: 'Prepaid', cod_collect_amount: 0 })
          .eq('order_id', orderId)
        logger.info('Delhivery shipment updated to Prepaid', { orderId, awb })
      } catch (err) {
        // Non-fatal — log and continue. Manual fallback via Delhivery One.
        logger.error('Failed to update Delhivery shipment to Prepaid', { err, orderId, awb })
      }
    }

    // 5. Confirmation WhatsApp
    const phone = getPhone(order.shipping_address as Record<string, unknown> | null)
    if (phone) {
      notifyCodPrepaidConfirmed({
        phone,
        userId: order.user_id,
        orderId,
        orderNumber: order.order_number,
        paidAmount: discountedTotal,
        savingsAmount,
      }).catch((err) =>
        logger.error('COD prepaid confirm WhatsApp failed (non-fatal)', { err, orderId })
      )
    }

    logger.info('COD prepaid conversion successful', { orderId, discountedTotal })

    return NextResponse.json({ success: true, discounted_total: discountedTotal })
  } catch (error) {
    logger.error('COD prepaid verify failed', { error })
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
