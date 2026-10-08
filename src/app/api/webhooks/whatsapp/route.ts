import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  recordCodDispatchReply,
  recordCodDispatchReplyByPhone,
} from '@/lib/cod-dispatch-confirm'
import logger from '@/lib/logger'

/**
 * POST /api/webhooks/whatsapp
 *
 * Handles inbound Veblika / Meta webhook payloads:
 * - Delivery status callbacks → logged in whatsapp_logs
 * - Quick reply "keep_cod" → marks the COD prepaid offer as declined
 *
 * Auth: when WHATSAPP_WEBHOOK_SECRET is set, require Authorization Bearer,
 * x-webhook-secret, or ?secret=. When unset, requests are accepted (configure
 * the secret in production).
 */
function isWebhookAuthorized(req: NextRequest): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!secret) {
    return true
  }

  const authorization = req.headers.get('authorization')
  if (authorization === `Bearer ${secret}`) return true

  const headerSecret = req.headers.get('x-webhook-secret')
  if (headerSecret === secret) return true

  const querySecret = req.nextUrl.searchParams.get('secret')
  if (querySecret === secret) return true

  return false
}

type CodReplyDecision = 'accepted' | 'declined'

function classifyCodReplyText(value: string): CodReplyDecision | null {
  const text = value.toLowerCase()
  if (text.includes("don't send") || text.includes('dont send')) return 'declined'
  if (text.includes('no') && text.includes('send')) return 'declined'
  if (text.includes('yes') && text.includes('send')) return 'accepted'
  return null
}

function collectMessages(body: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = []
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = value as Record<string, unknown>
    if (record.button || record.button_reply || record.interactive || record.text) {
      found.push(record)
    }
    if (Array.isArray(record.messages)) record.messages.forEach(visit)
    if (Array.isArray(record.entry)) record.entry.forEach(visit)
    if (Array.isArray(record.changes)) record.changes.forEach(visit)
    if (record.value && typeof record.value === 'object') visit(record.value)
  }
  visit(body)
  return found
}

function readPhone(body: Record<string, unknown>, message?: Record<string, unknown>): string | null {
  const candidates = [
    message?.from,
    body.phone,
    body.from,
    body.sender,
    body.wa_id,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return null
}

async function recordInboundCodReply(body: Record<string, unknown>) {
  const messages = collectMessages(body)
  const sources = messages.length ? messages : [body]

  for (const message of sources) {
    const button = message.button as { payload?: unknown; text?: unknown } | undefined
    const buttonReply = (message.button_reply ||
      (message.interactive as { button_reply?: { id?: unknown; title?: unknown } } | undefined)
        ?.button_reply) as { id?: unknown; title?: unknown } | undefined
    const textBody = (message.text as { body?: unknown } | undefined)?.body
    const payload = [button?.payload, buttonReply?.id].find(
      (value) => typeof value === 'string'
    ) as string | undefined
    const label = [button?.text, buttonReply?.title, textBody, message.message, message.body]
      .find((value) => typeof value === 'string') as string | undefined

    if (payload?.startsWith('cod_yes:')) {
      const orderId = payload.slice('cod_yes:'.length)
      if (orderId) await recordCodDispatchReply(orderId, 'accepted')
      return payload
    }
    if (payload?.startsWith('cod_no:')) {
      const orderId = payload.slice('cod_no:'.length)
      if (orderId) await recordCodDispatchReply(orderId, 'declined')
      return payload
    }

    const decision =
      (payload ? classifyCodReplyText(payload) : null) ||
      (label ? classifyCodReplyText(label) : null)
    if (!decision) {
      if (payload?.startsWith('keep_cod:')) return payload
      continue
    }

    const phone = readPhone(body, message)
    if (phone) await recordCodDispatchReplyByPhone(phone, decision)
    return payload || label || null
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    if (!isWebhookAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    logger.info('WhatsApp webhook received', { body })

    const admin = createAdminClient()
    const buttonId = await recordInboundCodReply(body)

    if (typeof buttonId === 'string' && buttonId.startsWith('keep_cod:')) {
      const orderId = buttonId.replace('keep_cod:', '')
      if (orderId) {
        const { error } = await admin
          .from('cod_prepaid_offers')
          .update({ offer_status: 'declined', declined_at: new Date().toISOString() })
          .eq('order_id', orderId)
          .eq('offer_status', 'pending')

        if (error) {
          logger.error('WhatsApp webhook: failed to decline COD prepaid offer', {
            error,
            orderId,
          })
        } else {
          logger.info('WhatsApp webhook: COD prepaid offer declined via quick reply', {
            orderId,
          })
        }
      }
    }

    await admin.from('whatsapp_logs').insert({
      phone: body?.phone || body?.messages?.[0]?.from || null,
      template_name: body?.template || body?.button_reply?.id || 'incoming',
      response: body,
      status: body?.status || 'received',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('WhatsApp webhook failed', { err })
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
