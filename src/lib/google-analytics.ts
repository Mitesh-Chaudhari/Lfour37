export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-N8LXSSV6Z2'

export const GA_CURRENCY = 'INR'

type GtagCommand = 'config' | 'event' | 'js' | 'set' | 'consent'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (
      command: GtagCommand,
      targetOrEventName: string | Date,
      params?: Record<string, unknown>
    ) => void
  }
}

export function isGoogleAnalyticsEnabled(): boolean {
  return Boolean(GA_MEASUREMENT_ID)
}

export function trackGaEvent(
  eventName: string,
  params?: Record<string, unknown>
): void {
  if (!isGoogleAnalyticsEnabled() || typeof window === 'undefined' || !window.gtag) {
    return
  }

  if (params) {
    window.gtag('event', eventName, params)
  } else {
    window.gtag('event', eventName)
  }
}

export function trackGaPageView(url: string): void {
  if (!isGoogleAnalyticsEnabled() || typeof window === 'undefined' || !window.gtag) {
    return
  }

  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path: url,
  })
}

export function trackGaViewItem(params: {
  productId: string
  productName: string
  price: number
  category?: string
}): void {
  trackGaEvent('view_item', {
    currency: GA_CURRENCY,
    value: params.price,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        price: params.price,
        quantity: 1,
        ...(params.category ? { item_category: params.category } : {}),
      },
    ],
  })
}

export function trackGaAddToCart(params: {
  productId: string
  productName: string
  price: number
  quantity: number
}): void {
  trackGaEvent('add_to_cart', {
    currency: GA_CURRENCY,
    value: params.price * params.quantity,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        price: params.price,
        quantity: params.quantity,
      },
    ],
  })
}

export function trackGaBeginCheckout(params: {
  value: number
  items: Array<{
    productId: string
    quantity: number
    price?: number
    productName?: string
  }>
}): void {
  trackGaEvent('begin_checkout', {
    currency: GA_CURRENCY,
    value: params.value,
    items: params.items.map((item) => ({
      item_id: item.productId,
      quantity: item.quantity,
      ...(item.price != null ? { price: item.price } : {}),
      ...(item.productName ? { item_name: item.productName } : {}),
    })),
  })
}

export function trackGaPurchase(params: {
  orderId: string
  value: number
  items: Array<{
    productId: string
    quantity: number
    price?: number
    productName?: string
  }>
}): void {
  const storageKey = `ga_purchase_${params.orderId}`
  if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) {
    return
  }

  trackGaEvent('purchase', {
    transaction_id: params.orderId,
    currency: GA_CURRENCY,
    value: params.value,
    items: params.items.map((item) => ({
      item_id: item.productId,
      quantity: item.quantity,
      ...(item.price != null ? { price: item.price } : {}),
      ...(item.productName ? { item_name: item.productName } : {}),
    })),
  })

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(storageKey, '1')
  }
}

export function trackGaSearch(searchTerm: string): void {
  trackGaEvent('search', {
    search_term: searchTerm,
  })
}
