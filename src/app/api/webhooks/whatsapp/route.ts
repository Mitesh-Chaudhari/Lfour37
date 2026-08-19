import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

/**
 * POST /api/webhooks/whatsapp
 *
 * Handles inbound Veblika / Meta webhook payloads:
 * - Delivery status callbacks → logged in whatsapp_logs
 * - Quick reply "keep_cod" → marks the COD prepaid offer as declined
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    logger.info('WhatsApp webhook received', { body })

    const admin = createAdminClient()

    // Handle quick reply buttons from Meta / Veblika
    // Veblika typically sends: { type: 'button', button_reply: { id, title }, order_id?, phone }
    // or the raw Meta payload: messages[0].interactive.button_reply.id
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

    // Log the raw event regardless
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
