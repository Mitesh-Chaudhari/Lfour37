export const VEBLIKA_TEMPLATE_CONFIG = {
  phone_otp_verify: { language: 'en', includeOtpButton: true },
  order_confirmation_update: { language: 'en' },
  order_shipped_updated: { language: 'en', includeUrlButton: true },
  order_picked_up: { language: 'en', includeUrlButton: true },
  order_in_transit: { language: 'en', includeUrlButton: true },
  order_out_for_delivery: { language: 'en', includeUrlButton: true },
  order_delivered: { language: 'en' },
  order_cancelled: { language: 'en' },
  exchange_requested: { language: 'en' },
  return_requested: { language: 'en' },
  welcome_lfour37: { language: 'en' },
} as const

export type VeblikaTemplateName = keyof typeof VEBLIKA_TEMPLATE_CONFIG

export type ShipmentWhatsAppMilestone =
  | 'shipment_created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'

export const SHIPMENT_MILESTONE_TEMPLATES: Record<
  ShipmentWhatsAppMilestone,
  VeblikaTemplateName
> = {
  shipment_created: 'order_shipped_updated',
  picked_up: 'order_picked_up',
  in_transit: 'order_in_transit',
  out_for_delivery: 'order_out_for_delivery',
}

export function isShipmentWhatsAppMilestone(
  milestone: string
): milestone is ShipmentWhatsAppMilestone {
  return milestone in SHIPMENT_MILESTONE_TEMPLATES
}

/**
 * WhatsApp/Meta rejects newlines and very long values inside template variables.
 * Keep each value on a single line and within Meta's limits.
 */
export function sanitizeWhatsAppParam(
  value: string | number | null | undefined,
  fallback = '-'
): string {
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!text) return fallback

  // Meta utility templates: keep variables reasonably short.
  return text.slice(0, 900)
}

/**
 * Comma-separated single-line summary (no line breaks — required by Meta).
 */
export function formatOrderItemsSummary(
  items: Array<{
    product_name: string
    variant_size?: string | null
    variant_color?: string | null
    quantity: number
  }> = []
): string {
  if (!items.length) return 'Your order items'

  return items
    .map((item) => {
      const variant = [item.variant_size, item.variant_color]
        .filter(Boolean)
        .join('/')
      const variantLabel = variant ? ` (${variant})` : ''
      return `${item.product_name}${variantLabel} x${item.quantity}`
    })
    .join(', ')
}

export function formatItemVariant(
  size?: string | null,
  color?: string | null
): string {
  const parts = [size, color].filter(Boolean)
  if (!parts.length) return '-'
  return parts.join(' / ')
}

export function formatItemLabel(
  productName: string,
  size?: string | null,
  color?: string | null
): string {
  const variant = formatItemVariant(size, color)
  if (variant === '-') return productName
  return `${productName} (${variant})`
}

export function formatWhatsAppStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    return_requested: 'Return Requested',
    return_approved: 'Return Approved',
    return_rejected: 'Return Rejected',
    cancel_requested: 'Cancellation Requested',
    cancelled: 'Cancelled',
    exchange_requested: 'Exchange Requested',
  }

  return (
    labels[status] ||
    status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  )
}

export type OrderConfirmationContext = {
  orderNumber: string
  total: string
  ordersUrl: string
  itemsSummary?: string
}

/**
 * Build bodyParams for order_confirmation_update (LFOUR37 approved template).
 *
 *   {{1}} order number — "Your order {{1}} has been confirmed."
 *   {{2}} items        — under "🛍️ Items:"
 *   {{3}} total        — under "💰 Total:"
 *
 * "View your order" CTA uses a static URL baked into the approved template
 * (https://www.lfour37.com/dashboard/orders) — no button param is sent.
 */
export function buildOrderConfirmationParams(
  context: OrderConfirmationContext
): string[] {
  const fields =
    process.env.WHATSAPP_ORDER_CONFIRMATION_FIELDS?.split(',')
      .map((field) => field.trim())
      .filter(Boolean) || ['order_number', 'items_summary', 'total']

  const values: Record<string, string> = {
    order_number: sanitizeWhatsAppParam(context.orderNumber),
    items_summary: sanitizeWhatsAppParam(
      context.itemsSummary,
      'Your order items'
    ),
    total: sanitizeWhatsAppParam(context.total),
    orders_url: sanitizeWhatsAppParam(context.ordersUrl),
  }

  return fields.map(
    (field) => values[field] || sanitizeWhatsAppParam(null)
  )
}

export function getDelhiveryTrackingUrl(awb: string): string {
  const cleaned = sanitizeWhatsAppParam(awb, 'N/A')
  return `https://www.delhivery.com/track/package/${encodeURIComponent(cleaned)}`
}

/** AWB for dynamic "Track your order" button ({{1}} in Delhivery package URL). */
export function getDelhiveryTrackingUrlButtonParam(awb: string): string {
  return sanitizeWhatsAppParam(awb, 'N/A')
}

/**
 * Body params for shipment milestone templates (all 4 templates share this shape).
 *
 *   {{1}} order id
 *   {{2}} items summary
 *   {{3}} tracking number (AWB)
 *   {{4}} Delhivery tracking URL
 */
export function buildOrderShipmentMilestoneParams(
  orderNumber: string,
  itemsSummary: string,
  trackingNumber: string
): string[] {
  return [
    sanitizeWhatsAppParam(orderNumber),
    sanitizeWhatsAppParam(itemsSummary, 'Your order items'),
    sanitizeWhatsAppParam(trackingNumber, 'N/A'),
    sanitizeWhatsAppParam(getDelhiveryTrackingUrl(trackingNumber)),
  ]
}

export function buildOrderDeliveredParams(
  orderNumber: string,
  ordersUrl: string
): string[] {
  // {{1}} order id, {{2}} check order url (https://www.lfour37.com/dashboard/orders)
  return [
    sanitizeWhatsAppParam(orderNumber),
    sanitizeWhatsAppParam(ordersUrl),
  ]
}

export function buildOrderCancelledParams(
  orderNumber: string,
  productName: string,
  variant: string,
  quantity: string,
  ordersUrl: string
): string[] {
  // {{1}} order id, {{2}} product, {{3}} variant, {{4}} qty, {{5}} track orders url
  return [
    sanitizeWhatsAppParam(orderNumber),
    sanitizeWhatsAppParam(productName, 'Order item'),
    sanitizeWhatsAppParam(variant),
    sanitizeWhatsAppParam(quantity, '1'),
    sanitizeWhatsAppParam(ordersUrl),
  ]
}

export function buildExchangeRequestedParams(
  orderNumber: string,
  productName: string,
  variant: string,
  ordersUrl: string
): string[] {
  // {{1}} order id, {{2}} product, {{3}} variant, {{4}} track orders url
  return [
    sanitizeWhatsAppParam(orderNumber),
    sanitizeWhatsAppParam(productName, 'Order item'),
    sanitizeWhatsAppParam(variant),
    sanitizeWhatsAppParam(ordersUrl),
  ]
}

export function buildReturnRequestedParams(
  orderNumber: string,
  itemLabel: string,
  currentStatus: string,
  ordersUrl: string
): string[] {
  // {{1}} order id, {{2}} item, {{3}} current status, {{4}} track updates url
  return [
    sanitizeWhatsAppParam(orderNumber),
    sanitizeWhatsAppParam(itemLabel, 'Order item'),
    sanitizeWhatsAppParam(currentStatus, 'Return Requested'),
    sanitizeWhatsAppParam(ordersUrl),
  ]
}
