/**
 * GET /api/cron/cod-prepaid-reminders
 *
 * Runs every 5 minutes (vercel.json).
 * For each pending COD → Prepaid offer:
 *   - t+20 min: send reminder 1 (if not sent)
 *   - t+40 min: send reminder 2 (if not sent)
 *   - t+45 min: mark expired
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { buildCodPrepaidPaymentUrl } from '@/lib/cod-prepaid-token'
import {
  notifyCodPrepaidReminder1,
  notifyCodPrepaidReminder2,
} from '@/lib/whatsapp/cod-prepaid'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

const REMINDER_1_MS = 20 * 60 * 1000
const REMINDER_2_MS = 40 * 60 * 1000

function isAuthorized(request: NextRequest): boolean {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const secret =
    process.env.COD_PREPAID_CRON_SECRET ||
    process.env.DELHIVERY_CRON_SECRET ||
    process.env.ABANDONED_CART_CRON_SECRET
  const authorization = request.headers.get('authorization')
  return isVercelCron || (Boolean(secret) && authorization === `Bearer ${secret}`)
}

function getPhone(address: Record<string, unknown> | null): string | null {
  if (!address) return null
  const phone = address.phone || address.mobile || address.contact
  return typeof phone === 'string' ? phone.trim() || null : null
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // Fetch all still-pending offers that haven't expired yet
  const { data: offers, error } = await admin
    .from('cod_prepaid_offers')
    .select(`
      id,
      order_id,
      original_total,
      discounted_total,
      expires_at,
      created_at,
      reminder_1_sent_at,
      reminder_2_sent_at,
      order:orders(
        id,
        user_id,
        order_number,
        shipping_address
      )
    `)
    .eq('offer_status', 'pending')
    .lte('created_at', now.toISOString()) // only old enough to check
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    logger.error('COD prepaid reminder cron query failed', { error })
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const results: Array<{ offerId: string; action: string }> = []

  for (const offer of offers || []) {
    const order = Array.isArray(offer.order) ? offer.order[0] : offer.order
    if (!order) continue

    const createdAt = new Date(offer.created_at).getTime()
    const ageMs = now.getTime() - createdAt
    const expiresAt = new Date(offer.expires_at)

    // Mark expired
    if (now >= expiresAt) {
      await admin
        .from('cod_prepaid_offers')
        .update({ offer_status: 'expired' })
        .eq('id', offer.id)
      results.push({ offerId: offer.id, action: 'expired' })
      continue
    }

    const phone = getPhone(order.shipping_address as Record<string, unknown> | null)
    if (!phone) continue

    const discountedTotal = Number(offer.discounted_total)
    const originalTotal = Number(offer.original_total)
    const savingsAmount = Math.round((originalTotal - discountedTotal) * 100) / 100
    const paymentUrl = buildCodPrepaidPaymentUrl(order.id, expiresAt)

    // Reminder 2 (t+40 min)
    if (ageMs >= REMINDER_2_MS && !offer.reminder_2_sent_at) {
      await notifyCodPrepaidReminder2({
        phone,
        userId: order.user_id,
        orderId: order.id,
        discountedTotal,
        savingsAmount,
        paymentUrl,
      })
      await admin
        .from('cod_prepaid_offers')
        .update({ reminder_2_sent_at: now.toISOString() })
        .eq('id', offer.id)
      results.push({ offerId: offer.id, action: 'reminder_2' })
      continue
    }

    // Reminder 1 (t+20 min)
    if (ageMs >= REMINDER_1_MS && !offer.reminder_1_sent_at) {
      await notifyCodPrepaidReminder1({
        phone,
        userId: order.user_id,
        orderId: order.id,
        discountedTotal,
        savingsAmount,
        paymentUrl,
      })
      await admin
        .from('cod_prepaid_offers')
        .update({ reminder_1_sent_at: now.toISOString() })
        .eq('id', offer.id)
      results.push({ offerId: offer.id, action: 'reminder_1' })
    }
  }

  logger.info('COD prepaid reminders cron complete', {
    processed: offers?.length || 0,
    actions: results,
  })

  return NextResponse.json({ success: true, results })
}
