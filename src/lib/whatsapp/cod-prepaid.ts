import { sendWhatsAppTemplate, isWhatsAppConfigured } from '@/lib/whatsapp'
import { sanitizeWhatsAppParam } from '@/lib/whatsapp/templates'
import logger from '@/lib/logger'

export type CodPrepaidOfferContext = {
  phone: string
  userId: string
  orderId: string
  orderNumber: string
  customerName: string
  originalTotal: number
  discountedTotal: number
  savingsAmount: number
  paymentUrl: string
}

function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Template: cod_prepaid_offer (sent immediately after COD order)
 *
 * Body variables:
 *   {{1}} customer first name
 *   {{2}} order number
 *   {{3}} discounted amount (₹X)
 *   {{4}} original amount (₹X)
 *   {{5}} savings amount (₹X)
 *
 * CTA button → dynamic payment URL ({{1}} suffix)
 */
export async function notifyCodPrepaidOffer(ctx: CodPrepaidOfferContext) {
  if (!isWhatsAppConfigured()) return null
  if (!ctx.phone?.trim()) return null

  try {
    return await sendWhatsAppTemplate({
      phone: ctx.phone,
      userId: ctx.userId,
      orderId: ctx.orderId,
      templateName: 'cod_prepaid_offer',
      variables: [
        sanitizeWhatsAppParam(ctx.customerName.split(' ')[0]),
        sanitizeWhatsAppParam(ctx.orderNumber),
        sanitizeWhatsAppParam(formatInr(ctx.discountedTotal)),
        sanitizeWhatsAppParam(formatInr(ctx.originalTotal)),
        sanitizeWhatsAppParam(formatInr(ctx.savingsAmount)),
      ],
      urlButtonParam: ctx.paymentUrl,
    })
  } catch (error) {
    logger.error('COD prepaid offer WhatsApp failed', { error, orderId: ctx.orderId })
    return null
  }
}

/**
 * Template: cod_prepaid_reminder_1 (sent at t+20 min)
 *
 * Body variables:
 *   {{1}} discounted amount (₹X)
 *   {{2}} savings amount (₹X)
 *
 * CTA button → dynamic payment URL
 */
export async function notifyCodPrepaidReminder1({
  phone,
  userId,
  orderId,
  discountedTotal,
  savingsAmount,
  paymentUrl,
}: Pick<
  CodPrepaidOfferContext,
  'phone' | 'userId' | 'orderId' | 'discountedTotal' | 'savingsAmount' | 'paymentUrl'
>) {
  if (!isWhatsAppConfigured()) return null
  if (!phone?.trim()) return null

  try {
    return await sendWhatsAppTemplate({
      phone,
      userId,
      orderId,
      templateName: 'cod_prepaid_reminder_1',
      variables: [
        sanitizeWhatsAppParam(formatInr(discountedTotal)),
        sanitizeWhatsAppParam(formatInr(savingsAmount)),
      ],
      urlButtonParam: paymentUrl,
    })
  } catch (error) {
    logger.error('COD prepaid reminder 1 WhatsApp failed', { error, orderId })
    return null
  }
}

/**
 * Template: cod_prepaid_reminder_2 (sent at t+40 min — "Final 5 minutes")
 *
 * Body variables:
 *   {{1}} discounted amount (₹X)
 *   {{2}} savings amount (₹X)
 *
 * CTA button → dynamic payment URL
 */
export async function notifyCodPrepaidReminder2({
  phone,
  userId,
  orderId,
  discountedTotal,
  savingsAmount,
  paymentUrl,
}: Pick<
  CodPrepaidOfferContext,
  'phone' | 'userId' | 'orderId' | 'discountedTotal' | 'savingsAmount' | 'paymentUrl'
>) {
  if (!isWhatsAppConfigured()) return null
  if (!phone?.trim()) return null

  try {
    return await sendWhatsAppTemplate({
      phone,
      userId,
      orderId,
      templateName: 'cod_prepaid_reminder_2',
      variables: [
        sanitizeWhatsAppParam(formatInr(discountedTotal)),
        sanitizeWhatsAppParam(formatInr(savingsAmount)),
      ],
      urlButtonParam: paymentUrl,
    })
  } catch (error) {
    logger.error('COD prepaid reminder 2 WhatsApp failed', { error, orderId })
    return null
  }
}

/**
 * Template: cod_prepaid_confirmed (sent after successful payment)
 *
 * Body variables:
 *   {{1}} order number
 *   {{2}} amount paid (₹X)
 *   {{3}} savings amount (₹X)
 */
export async function notifyCodPrepaidConfirmed({
  phone,
  userId,
  orderId,
  orderNumber,
  paidAmount,
  savingsAmount,
}: {
  phone: string
  userId: string
  orderId: string
  orderNumber: string
  paidAmount: number
  savingsAmount: number
}) {
  if (!isWhatsAppConfigured()) return null
  if (!phone?.trim()) return null

  try {
    return await sendWhatsAppTemplate({
      phone,
      userId,
      orderId,
      templateName: 'cod_prepaid_confirmed',
      variables: [
        sanitizeWhatsAppParam(orderNumber),
        sanitizeWhatsAppParam(formatInr(paidAmount)),
        sanitizeWhatsAppParam(formatInr(savingsAmount)),
      ],
    })
  } catch (error) {
    logger.error('COD prepaid confirmed WhatsApp failed', { error, orderId })
    return null
  }
}
