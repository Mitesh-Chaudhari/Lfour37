import { sendWhatsAppTemplate, isWhatsAppConfigured } from '@/lib/whatsapp'
import {
  buildOrderCancelledParams,
  buildOrderConfirmationParams,
  buildOrderDeliveredParams,
  buildOrderShippedParams,
  buildExchangeRequestedParams,
  buildReturnRequestedParams,
  formatItemLabel,
  formatItemVariant,
  formatOrderItemsSummary,
  formatWhatsAppStatusLabel,
} from '@/lib/whatsapp/templates'
import logger from '@/lib/logger'

type OrderItem = {
  product_name: string
  variant_size?: string | null
  variant_color?: string | null
  quantity: number
}

type OrderForWhatsApp = {
  id: string
  order_number: string
  total: number
  created_at: string
  user_id: string
  shipping_address?: {
    phone?: string | null
    full_name?: string | null
  } | null
  items?: OrderItem[]
}

function getOrdersUrl(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.lfour37.com'}/dashboard/orders`
}

function getOrderPhone(order: OrderForWhatsApp): string | null {
  const phone = order.shipping_address?.phone?.trim()
  return phone || null
}

function formatOrderItems(items: OrderItem[] = []): string {
  return formatOrderItemsSummary(items)
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export async function notifyOrderConfirmation(order: OrderForWhatsApp) {
  const phone = getOrderPhone(order)
  if (!phone || !isWhatsAppConfigured()) return

  try {
    const variables = buildOrderConfirmationParams({
      orderNumber: order.order_number,
      total: formatInr(order.total),
      ordersUrl: getOrdersUrl(),
      itemsSummary: formatOrderItems(order.items),
    })

    await sendWhatsAppTemplate({
      phone,
      userId: order.user_id,
      orderId: order.id,
      templateName: 'order_confirmation',
      variables,
    })
  } catch (error) {
    logger.error('Order confirmation WhatsApp failed', {
      error,
      orderId: order.id,
    })
  }
}

export async function notifyOrderShipped(
  order: Pick<OrderForWhatsApp, 'id' | 'order_number' | 'user_id' | 'shipping_address'>,
  trackingNumber?: string | null
) {
  const phone = getOrderPhone(order as OrderForWhatsApp)
  if (!phone || !isWhatsAppConfigured()) return

  try {
    await sendWhatsAppTemplate({
      phone,
      userId: order.user_id,
      orderId: order.id,
      templateName: 'order_shipped',
      variables: buildOrderShippedParams(
        order.order_number,
        trackingNumber || 'N/A',
        getOrdersUrl()
      ),
    })
  } catch (error) {
    logger.error('Order shipped WhatsApp failed', { error, orderId: order.id })
  }
}

export async function notifyOrderDelivered(
  order: Pick<OrderForWhatsApp, 'id' | 'order_number' | 'user_id' | 'shipping_address'>
) {
  const phone = getOrderPhone(order as OrderForWhatsApp)
  if (!phone || !isWhatsAppConfigured()) return

  try {
    await sendWhatsAppTemplate({
      phone,
      userId: order.user_id,
      orderId: order.id,
      templateName: 'order_delivered',
      variables: buildOrderDeliveredParams(order.order_number, getOrdersUrl()),
    })
  } catch (error) {
    logger.error('Order delivered WhatsApp failed', { error, orderId: order.id })
  }
}

export async function notifyOrderCancelled({
  order,
  item,
}: {
  order: Pick<OrderForWhatsApp, 'id' | 'order_number' | 'user_id' | 'shipping_address'>
  item?: OrderItem | null
}) {
  const phone = getOrderPhone(order as OrderForWhatsApp)
  if (!phone || !isWhatsAppConfigured()) return

  try {
    await sendWhatsAppTemplate({
      phone,
      userId: order.user_id,
      orderId: order.id,
      templateName: 'order_cancelled',
      variables: buildOrderCancelledParams(
        order.order_number,
        item?.product_name || 'Order item',
        formatItemVariant(item?.variant_size, item?.variant_color),
        String(item?.quantity || 1),
        getOrdersUrl()
      ),
    })
  } catch (error) {
    logger.error('Order cancelled WhatsApp failed', { error, orderId: order.id })
  }
}

export async function notifyReturnOrExchangeRequested({
  order,
  item,
  returnType,
  currentStatus,
}: {
  order: Pick<OrderForWhatsApp, 'id' | 'order_number' | 'user_id' | 'shipping_address'>
  item: OrderItem
  returnType: 'return' | 'exchange'
  currentStatus?: string
}) {
  const phone = getOrderPhone(order as OrderForWhatsApp)
  if (!phone || !isWhatsAppConfigured()) return

  const itemLabel = formatItemLabel(
    item.product_name,
    item.variant_size,
    item.variant_color
  )
  const variant = formatItemVariant(item.variant_size, item.variant_color)
  const statusLabel = formatWhatsAppStatusLabel(
    currentStatus || (returnType === 'exchange' ? 'exchange_requested' : 'return_requested')
  )

  try {
    if (returnType === 'exchange') {
      await sendWhatsAppTemplate({
        phone,
        userId: order.user_id,
        orderId: order.id,
        templateName: 'exchange_requested',
        variables: buildExchangeRequestedParams(
          order.order_number,
          item.product_name,
          variant,
          getOrdersUrl()
        ),
      })
      return
    }

    await sendWhatsAppTemplate({
      phone,
      userId: order.user_id,
      orderId: order.id,
      templateName: 'return_requested',
      variables: buildReturnRequestedParams(
        order.order_number,
        itemLabel,
        statusLabel,
        getOrdersUrl()
      ),
    })
  } catch (error) {
    logger.error('Return/exchange WhatsApp failed', {
      error,
      orderId: order.id,
      returnType,
    })
  }
}
