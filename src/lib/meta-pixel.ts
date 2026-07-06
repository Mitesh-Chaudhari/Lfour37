export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '1629025605190039'

export const META_CURRENCY = 'INR'

type FbqCommand = 'track' | 'trackCustom' | 'init'

declare global {
  interface Window {
    fbq?: (
      command: FbqCommand,
      eventName: string,
      params?: Record<string, unknown>
    ) => void
  }
}

export function isMetaPixelEnabled(): boolean {
  return Boolean(META_PIXEL_ID)
}

export function trackMetaEvent(
  eventName: string,
  params?: Record<string, unknown>
): void {
  if (!isMetaPixelEnabled() || typeof window === 'undefined' || !window.fbq) {
    return
  }

  if (params) {
    window.fbq('track', eventName, params)
  } else {
    window.fbq('track', eventName)
  }
}

export function trackAddToCart(params: {
  productId: string
  productName: string
  price: number
  quantity: number
}): void {
  trackMetaEvent('AddToCart', {
    content_ids: [params.productId],
    content_name: params.productName,
    content_type: 'product',
    value: params.price * params.quantity,
    currency: META_CURRENCY,
    num_items: params.quantity,
  })
}

export function trackInitiateCheckout(params: {
  value: number
  numItems: number
  contentIds: string[]
}): void {
  trackMetaEvent('InitiateCheckout', {
    content_ids: params.contentIds,
    content_type: 'product',
    value: params.value,
    currency: META_CURRENCY,
    num_items: params.numItems,
  })
}

export function trackPurchase(params: {
  orderId: string
  value: number
  numItems: number
  contentIds: string[]
}): void {
  const storageKey = `meta_pixel_purchase_${params.orderId}`
  if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) {
    return
  }

  trackMetaEvent('Purchase', {
    content_ids: params.contentIds,
    content_type: 'product',
    value: params.value,
    currency: META_CURRENCY,
    num_items: params.numItems,
  })

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(storageKey, '1')
  }
}
