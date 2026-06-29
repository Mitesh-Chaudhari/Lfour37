import { createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'
import {
  VEBLIKA_TEMPLATE_CONFIG,
  type VeblikaTemplateName,
  sanitizeWhatsAppParam,
} from '@/lib/whatsapp/templates'

export function normalizePhone(phone: string) {
  let cleaned = phone.replace(/\D/g, '')

  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`
  }

  if (!cleaned.startsWith('91') && cleaned.length > 10) {
    return cleaned
  }

  if (!cleaned.startsWith('91')) {
    cleaned = `91${cleaned}`
  }

  return cleaned
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_API_KEY && process.env.VEBLIKA_PHONE_NUMBER_ID
  )
}

interface SendWhatsappProps {
  phone: string
  message: string
  userId?: string
  orderId?: string
  templateName?: string
}

interface SendTemplateProps {
  phone: string
  templateName: VeblikaTemplateName | string
  variables: string[]
  userId?: string
  orderId?: string
  language?: string
  urlButtonParam?: string
}

async function logWhatsAppMessage(entry: {
  userId?: string
  orderId?: string
  phone: string
  templateName: string
  templateVariables?: string[]
  message: unknown
  response: unknown
  providerMessageId?: string | null
  status: 'sent' | 'failed'
}) {
  try {
    const supabase = createAdminClient()
    await supabase.from('whatsapp_logs').insert({
      user_id: entry.userId || null,
      order_id: entry.orderId || null,
      phone: entry.phone,
      template_name: entry.templateName,
      template_variables: entry.templateVariables || null,
      message: entry.message,
      response: entry.response,
      provider_message_id: entry.providerMessageId || null,
      status: entry.status,
    })
  } catch (error) {
    logger.warn('Failed to write whatsapp_logs row', { error })
  }
}

export async function sendWhatsAppMessage({
  phone,
  message,
  userId,
  orderId,
  templateName = 'text_message',
}: SendWhatsappProps) {
  if (!isWhatsAppConfigured()) {
    logger.warn('WhatsApp skipped because env is not configured', { templateName })
    return null
  }

  try {
    const payload = {
      to: normalizePhone(phone),
      phoneNoId: process.env.VEBLIKA_PHONE_NUMBER_ID,
      type: 'text',
      text: message,
    }

    const response = await fetch(
      'https://automate.veblika.com/api/v2/whatsapp-business/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_API_KEY}`,
        },
        body: JSON.stringify(payload),
      }
    )

    const raw = await response.text()
    let data: Record<string, unknown> = { raw }

    try {
      data = raw ? JSON.parse(raw) : {}
    } catch {
      // Veblika may return plain text on some errors.
    }

    await logWhatsAppMessage({
      userId,
      orderId,
      phone,
      templateName,
      message: payload,
      response: data,
      providerMessageId:
        typeof data.messageId === 'string' ? data.messageId : null,
      status: response.ok ? 'sent' : 'failed',
    })

    if (!response.ok) {
      logger.error('WhatsApp API error', { templateName, phone, data })
      return null
    }

    return data
  } catch (error) {
    logger.error('WhatsApp send failed', { error, templateName, phone })

    await logWhatsAppMessage({
      userId,
      orderId,
      phone,
      templateName,
      message: { text: message },
      response: {
        error: error instanceof Error ? error.message : String(error),
      },
      status: 'failed',
    })

    return null
  }
}

export async function sendWhatsAppTemplate({
  phone,
  templateName,
  variables,
  userId,
  orderId,
  language,
  urlButtonParam,
}: SendTemplateProps) {
  if (!isWhatsAppConfigured()) {
    logger.warn('WhatsApp template skipped because env is not configured', {
      templateName,
    })
    return null
  }

  const templateConfig =
    VEBLIKA_TEMPLATE_CONFIG[templateName as VeblikaTemplateName]

  const resolvedLanguage =
    language || templateConfig?.language || 'en'

  const bodyParams = variables.map((value) => sanitizeWhatsAppParam(value))

  const payload: Record<string, unknown> = {
    to: normalizePhone(phone),
    phoneNoId: process.env.VEBLIKA_PHONE_NUMBER_ID,
    type: 'template',
    name: templateName,
    language: resolvedLanguage,
    bodyParams,
  }

  if (templateName === 'phone_otp_verify' && bodyParams[0]) {
    payload.buttons = [
      {
        type: 'button',
        sub_type: 'url',
        text: bodyParams[0],
      },
    ]
  } else if (urlButtonParam) {
    payload.buttons = [
      {
        type: 'button',
        sub_type: 'url',
        text: sanitizeWhatsAppParam(urlButtonParam),
      },
    ]
  }

  try {
    const response = await fetch(
      'https://automate.veblika.com/api/v2/whatsapp-business/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_API_KEY}`,
        },
        body: JSON.stringify(payload),
      }
    )

    const raw = await response.text()
    let data: Record<string, unknown> = { raw }

    try {
      data = raw ? JSON.parse(raw) : {}
    } catch {
      // ignore parse errors
    }

    await logWhatsAppMessage({
      userId,
      orderId,
      phone,
      templateName,
      templateVariables: variables,
      message: payload,
      response: data,
      providerMessageId:
        typeof data.messageId === 'string' ? data.messageId : null,
      status: response.ok ? 'sent' : 'failed',
    })

    if (!response.ok) {
      logger.error('WhatsApp template error', {
        templateName,
        phone: normalizePhone(phone),
        paramCount: bodyParams.length,
        bodyParams,
        status: response.status,
        data,
      })
      return null
    }

    logger.info('WhatsApp template sent', {
      templateName,
      phone: normalizePhone(phone),
      orderId,
    })

    return data
  } catch (error) {
    logger.error('WhatsApp template send failed', {
      error,
      templateName,
      phone,
    })

    await logWhatsAppMessage({
      userId,
      orderId,
      phone,
      templateName,
      templateVariables: variables,
      message: payload,
      response: {
        error: error instanceof Error ? error.message : String(error),
      },
      status: 'failed',
    })

    return null
  }
}
