import { sendWhatsAppTemplate, isWhatsAppConfigured } from '@/lib/whatsapp'
import { getAbandonedCartUrlButtonParam } from '@/lib/whatsapp/templates'
import logger from '@/lib/logger'

export type NotifyAbandonedCartInput = {
  phone: string
  userId: string
  /** First cart product image (public HTTPS). Falls back to brand creative env. */
  firstProductImage?: string | null
  /** Path segment for Shop Now CTA (template URL …/{{1}}). Default: cart */
  cartPath?: string
}

function resolveHeaderImage(productImage?: string | null): string | undefined {
  const fromProduct = productImage?.trim()
  if (fromProduct?.startsWith('https://')) return fromProduct

  const brandCreative = process.env.ABANDONED_CART_HEADER_IMAGE_URL?.trim()
  if (brandCreative?.startsWith('https://')) return brandCreative

  return undefined
}

/**
 * Marketing template abandoned_cart_reminder:
 * - IMAGE header (dynamic product or fixed brand creative)
 * - Body copy approved in Meta (usually no body variables)
 * - Shop Now URL button → {{1}} e.g. "cart"
 */
export async function notifyAbandonedCart({
  phone,
  userId,
  firstProductImage,
  cartPath = 'cart',
}: NotifyAbandonedCartInput) {
  if (!isWhatsAppConfigured()) {
    logger.warn('Abandoned cart WhatsApp skipped — WhatsApp not configured', {
      userId,
    })
    return null
  }

  if (!phone?.trim()) {
    logger.warn('Abandoned cart WhatsApp skipped — missing phone', { userId })
    return null
  }

  try {
    return await sendWhatsAppTemplate({
      phone,
      userId,
      templateName: 'abandoned_cart_reminder',
      variables: [],
      urlButtonParam: getAbandonedCartUrlButtonParam(cartPath),
      headerImageUrl: resolveHeaderImage(firstProductImage),
    })
  } catch (error) {
    logger.error('Abandoned cart WhatsApp failed', { error, userId })
    return null
  }
}
