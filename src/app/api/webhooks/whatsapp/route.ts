import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
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

export async function POST(req: NextRequest) {
  try {
    if (!isWebhookAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    logger.info('WhatsApp webhook received', { body })

    const admin = createAdminClient()

    const buttonId =
      body?.button_reply?.id ||
      body?.messages?.[0]?.interactive?.button_reply?.id ||
      body?.interactive?.button_reply?.id

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
