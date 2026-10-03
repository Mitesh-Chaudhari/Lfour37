import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppTemplate, isWhatsAppConfigured } from '@/lib/whatsapp'
import {
  formatOrderItemsSummary,
  sanitizeWhatsAppParam,
} from '@/lib/whatsapp/templates'
import logger from '@/lib/logger'

export const COD_DISPATCH_MAX_SENDS = 3
export const COD_DISPATCH_INTERVAL_MS = 8 * 60 * 60 * 1000

export type CodDispatchStatus = 'pending' | 'accepted' | 'declined'

type ConfirmItem = {
  product_name: string
  variant_size?: string | null
  variant_color?: string | null
  quantity: number
}

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

function firstName(fullName: string | null | undefined): string {
  const name = fullName?.trim().split(/\s+/)[0]
  return name || 'there'
}

export function codDispatchYesPayload(orderId: string): string {
  return `cod_yes:${orderId}`
}

export function codDispatchNoPayload(orderId: string): string {
  return `cod_no:${orderId}`
}

async function sendCodDispatchConfirm({
  phone,
  userId,
  orderId,
  orderNumber,
  customerName,
  items,
  codAmount,
}: {
  phone: string
  userId: string
  orderId: string
  orderNumber: string
  customerName: string
  items: ConfirmItem[]
  codAmount: number
}) {
  if (!isWhatsAppConfigured() || !phone.trim()) return null

  return sendWhatsAppTemplate({
    phone,
    userId,
    orderId,
    templateName: 'cod_dispatch_confirm',
    variables: [
      sanitizeWhatsAppParam(firstName(customerName)),
      sanitizeWhatsAppParam(orderNumber),
      sanitizeWhatsAppParam(formatOrderItemsSummary(items)),
      sanitizeWhatsAppParam(formatInr(codAmount)),
    ],
    quickReplyPayloads: [
      codDispatchYesPayload(orderId),
      codDispatchNoPayload(orderId),
    ],
  })
}

/**
 * First COD dispatch confirmation, sent when the COD order is placed.
 * Later sends are handled by the cron until the customer replies or 3 sends.
 */
export async function startCodDispatchConfirmation(orderId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: order, error } = await admin
    .from('orders')
    .select(
      'id, order_number, user_id, total, cod_collect_amount, payment_method, status, shipping_address, cod_dispatch_status, cod_dispatch_sends, items:order_items(product_name, variant_size, variant_color, quantity)'
    )
    .eq('id', orderId)
    .single()

  if (error || !order) {
    logger.warn('COD dispatch confirm skipped — order not found', { orderId, error })
    return
  }

  if (order.payment_method !== 'cod') return
  if (order.cod_dispatch_status && order.cod_dispatch_status !== 'pending') return
  if (Number(order.cod_dispatch_sends || 0) > 0) return

  const address = order.shipping_address as {
    phone?: string | null
    full_name?: string | null
  } | null
  const phone = address?.phone?.trim()
  if (!phone) return

  const { data: claimed } = await admin
    .from('orders')
    .update({
      cod_dispatch_status: 'pending',
      cod_dispatch_sends: 1,
      cod_dispatch_last_sent_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('cod_dispatch_sends', 0)
    .select('id')
    .maybeSingle()

  if (!claimed) return

  const sent = await sendCodDispatchConfirm({
    phone,
    userId: order.user_id,
    orderId: order.id,
    orderNumber: order.order_number,
    customerName: address?.full_name || '',
    items: order.items || [],
    codAmount: Number(order.cod_collect_amount ?? order.total ?? 0),
  })

  if (!sent) {
    await admin
      .from('orders')
      .update({
        cod_dispatch_status: 'pending',
        cod_dispatch_sends: 0,
        cod_dispatch_last_sent_at: null,
      })
      .eq('id', orderId)
      .eq('cod_dispatch_status', 'pending')
      .eq('cod_dispatch_sends', 1)
  }
}

export async function sendDueCodDispatchReminders(limit = 50): Promise<number> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - COD_DISPATCH_INTERVAL_MS).toISOString()

  const { data: orders, error } = await admin
    .from('orders')
    .select(
      'id, order_number, user_id, total, cod_collect_amount, shipping_address, cod_dispatch_sends, cod_dispatch_last_sent_at, items:order_items(product_name, variant_size, variant_color, quantity)'
    )
    .eq('payment_method', 'cod')
    .eq('cod_dispatch_status', 'pending')
    .in('status', ['pending', 'paid', 'processing'])
    .lt('cod_dispatch_sends', COD_DISPATCH_MAX_SENDS)
    .order('cod_dispatch_last_sent_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (error) {
    logger.error('COD dispatch reminder query failed', { error })
    return 0
  }

  let sentCount = 0
  for (const order of orders || []) {
    const sends = Number(order.cod_dispatch_sends || 0)
    const lastSent = order.cod_dispatch_last_sent_at as string | null
    if (sends > 0 && lastSent && lastSent > cutoff) continue

    const address = order.shipping_address as {
      phone?: string | null
      full_name?: string | null
    } | null
    const phone = address?.phone?.trim()
    if (!phone) continue

    const { data: claimed } = await admin
      .from('orders')
      .update({
        cod_dispatch_sends: sends + 1,
        cod_dispatch_last_sent_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('cod_dispatch_status', 'pending')
      .eq('cod_dispatch_sends', sends)
      .select('id')
      .maybeSingle()

    if (!claimed) continue

    const sent = await sendCodDispatchConfirm({
      phone,
      userId: order.user_id,
      orderId: order.id,
      orderNumber: order.order_number,
      customerName: address?.full_name || '',
      items: order.items || [],
      codAmount: Number(order.cod_collect_amount ?? order.total ?? 0),
    })

    if (!sent) {
      await admin
        .from('orders')
        .update({
          cod_dispatch_sends: sends,
          cod_dispatch_last_sent_at: cutoff,
        })
        .eq('id', order.id)
        .eq('cod_dispatch_sends', sends + 1)
        .eq('cod_dispatch_status', 'pending')
      continue
    }

    sentCount += 1
  }

  return sentCount
}

export async function recordCodDispatchReplyByPhone(
  phone: string,
  decision: 'accepted' | 'declined'
): Promise<boolean> {
  const digits = phone.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  if (last10.length !== 10) return false

  const admin = createAdminClient()
  const { data: orders, error } = await admin
    .from('orders')
    .select('id, shipping_address')
    .eq('payment_method', 'cod')
    .eq('cod_dispatch_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    logger.error('COD dispatch phone lookup failed', { error })
    return false
  }

  const match = (orders || []).find((order) => {
    const address = order.shipping_address as { phone?: string | null } | null
    const orderPhone = (address?.phone || '').replace(/\D/g, '').slice(-10)
    return orderPhone === last10
  })

  if (!match) return false
  return recordCodDispatchReply(match.id, decision)
}

export async function recordCodDispatchReply(
  orderId: string,
  decision: 'accepted' | 'declined'
): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('orders')
    .update({ cod_dispatch_status: decision })
    .eq('id', orderId)
    .eq('cod_dispatch_status', 'pending')
    .eq('payment_method', 'cod')
    .select('id')
    .maybeSingle()

  if (error) {
    logger.error('Failed to record COD dispatch reply', { error, orderId, decision })
    return false
  }

  return Boolean(data)
}
