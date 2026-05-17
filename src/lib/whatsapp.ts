import { createClient }
from '@/lib/supabase/server'

export function normalizePhone(
  phone: string
) {
  let cleaned =
    phone.replace(/\D/g, '')

  // Add India country code if missing
  if (!cleaned.startsWith('91')) {
    cleaned = `91${cleaned}`
  }

  return cleaned
}

// ========================================
// TYPES
// ========================================

interface SendWhatsappProps {
  phone: string
  message: string
  userId?: string
  orderId?: string
  templateName?: string
}

interface SendTemplateProps {
  phone: string

  templateName: string

  variables: string[]

  userId?: string

  orderId?: string
}

// ========================================
// NORMAL TEXT MESSAGE
// ========================================

export async function sendWhatsAppMessage({
  phone,
  message,
  userId,
  orderId,
  templateName = 'text_message',
}: SendWhatsappProps) {

  const supabase =
    await createClient()

  try {

    const payload = {
      to: normalizePhone(phone),

      phoneNoId:
        process.env
          .VEBLIKA_PHONE_NUMBER_ID,

      type: 'text',

      text: message,
    }

    const response =
      await fetch(
        'https://automate.veblika.com/api/v2/whatsapp-business/messages',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${process.env.VEBLIKA_API_KEY}`,
          },

          body: JSON.stringify(
            payload
          ),
        }
      )

    const data =
      await response.json()

    // SAVE LOG
    await supabase
      .from('whatsapp_logs')
      .insert({
        user_id:
          userId || null,

        order_id:
          orderId || null,

        phone,

        template_name:
          templateName,

        message: payload,

        response: data,

        provider_message_id:
          data?.messageId || null,

        status:
          response.ok
            ? 'sent'
            : 'failed',
      })

    if (!response.ok) {

      console.error(
        'WhatsApp API Error',
        data
      )

      return null
    }

    return data

  } catch (err: any) {

    console.error(
      'WhatsApp Send Failed',
      err
    )

    // SAVE FAILURE
    await supabase
      .from('whatsapp_logs')
      .insert({
        user_id:
          userId || null,

        order_id:
          orderId || null,

        phone,

        template_name:
          templateName,

        message: {
          text: message,
        },

        response: {
          error:
            err?.message,
        },

        status: 'failed',
      })

    return null
  }
}

// ========================================
// TEMPLATE MESSAGE
// ========================================

export async function sendWhatsAppTemplate({
  phone,
  templateName,
  variables,
  userId,
  orderId,
}: SendTemplateProps) {

  const supabase =
    await createClient()

  try {

    const payload = {
      to: normalizePhone(phone),

      phoneNoId:
        process.env
          .VEBLIKA_PHONE_NUMBER_ID,

      type: 'template',

      template: {
        name: templateName,

        language: {
          code: 'en',
        },

        body: {
          variables,
        },
      },
    }

    const response =
      await fetch(
        'https://automate.veblika.com/api/v2/whatsapp-business/messages',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${process.env.VEBLIKA_API_KEY}`,
          },

          body: JSON.stringify(
            payload
          ),
        }
      )

    const data =
      await response.json()

    // SAVE LOG
    await supabase
      .from('whatsapp_logs')
      .insert({
        user_id:
          userId || null,

        order_id:
          orderId || null,

        phone,

        template_name:
          templateName,

        template_variables:
          variables,

        message: payload,

        response: data,

        provider_message_id:
          data?.messageId || null,

        status:
          response.ok
            ? 'sent'
            : 'failed',
      })

    if (!response.ok) {

      console.error(
        'WhatsApp Template Error',
        data
      )

      return null
    }

    return data

  } catch (err: any) {

    console.error(
      'Template Send Failed',
      err
    )

    // SAVE FAILURE
    await supabase
      .from('whatsapp_logs')
      .insert({
        user_id:
          userId || null,

        order_id:
          orderId || null,

        phone,

        template_name:
          templateName,

        template_variables:
          variables,

        message: {
          template: templateName,
          variables,
        },

        response: {
          error:
            err?.message,
        },

        status: 'failed',
      })

    return null
  }
}