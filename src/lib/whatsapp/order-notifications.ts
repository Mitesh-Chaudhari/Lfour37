import { sendWhatsAppTemplate, isWhatsAppConfigured } from '@/lib/whatsapp'
import {
  buildOrderCancelledParams,
  buildOrderConfirmationParams,
  buildOrderDeliveredParams,
  buildOrderShipmentMilestoneParams,
  buildExchangeRequestedParams,
  buildExchangePickupPickedUpParams,
  buildExchangePickupReceivedParams,
  buildReturnPickupPickedUpParams,
  buildReturnPickupReceivedParams,
  buildReturnRequestedParams,
  formatItemLabel,
  formatItemVariant,
  formatOrderItemsSummary,
  formatWhatsAppStatusLabel,
  getDelhiveryTrackingUrlButtonParam,
  getReversePickupTemplateName,
  SHIPMENT_MILESTONE_TEMPLATES,
  type ReversePickupWhatsAppMilestone,
  type ShipmentWhatsAppMilestone,
} from '@/lib/whatsapp/templates'
import logger from '@/lib/logger'

type OrderItem = {
  product_name: string
  variant_size?: string | null
  variant_color?: string | null
  exchange_size?: string | null
  exchange_color?: string | null
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

function getCustomerAppUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl)
      const isLocalhost =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1'

      if (!isLocalhost) {
        return url.origin.replace(/\/$/, '')
      }
    } catch {
      // Fall through to the customer-facing production URL.
    }
  }

  return 'https://www.lfour37.com'
}

function getOrdersUrl(): string {
  return `${getCustomerAppUrl()}/dashboard/orders`
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
      templateName: 'order_confirmation_update',
      variables,
    })
  } catch (error) {
    logger.error('Order confirmation WhatsApp failed', {
      error,
      orderId: order.id,
    })
  }
}

export async function notifyOrderShipmentMilestone({
  order,
  milestone,
  trackingNumber,
  items,
}: {
  order: Pick<
    OrderForWhatsApp,
    'id' | 'order_number' | 'user_id' | 'shipping_address'
  >
  milestone: ShipmentWhatsAppMilestone
  trackingNumber?: string | null
  items?: OrderItem[]
}) {
  const phone = getOrderPhone(order as OrderForWhatsApp)
  if (!phone || !isWhatsAppConfigured()) return

  const awb = trackingNumber?.trim() || 'N/A'
  const templateName = SHIPMENT_MILESTONE_TEMPLATES[milestone]

  try {
    await sendWhatsAppTemplate({
      phone,
      userId: order.user_id,
      orderId: order.id,
      templateName,
      variables: buildOrderShipmentMilestoneParams(
        order.order_number,
        formatOrderItems(items),
        awb
      ),
      urlButtonParam: getDelhiveryTrackingUrlButtonParam(awb),
    })
  } catch (error) {
    logger.error('Shipment milestone WhatsApp failed', {
      error,
      orderId: order.id,
      milestone,
      templateName,
    })
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

export async function notifyReversePickupMilestone({
  order,
  item,
  milestone,
  trackingNumber,
  pickupType,
}: {
  order: Pick<
    OrderForWhatsApp,
    'id' | 'order_number' | 'user_id' | 'shipping_address'
  >
  item: OrderItem
  milestone: ReversePickupWhatsAppMilestone
  trackingNumber?: string | null
  pickupType?: 'return' | 'exchange'
}) {
  const phone = getOrderPhone(order as OrderForWhatsApp)
  if (!phone || !isWhatsAppConfigured()) return

  const flow: 'return' | 'exchange' = pickupType === 'exchange' ? 'exchange' : 'return'
  const itemLabel = formatItemLabel(
    item.product_name,
    item.variant_size,
    item.variant_color
  )
  const templateName = getReversePickupTemplateName(milestone, flow)
  const awb = trackingNumber?.trim() || 'N/A'

  try {
    if (milestone === 'reverse_picked_up') {
      const variables =
        flow === 'exchange'
          ? buildExchangePickupPickedUpParams(
              order.order_number,
              itemLabel,
              awb
            )
          : buildReturnPickupPickedUpParams(
              order.order_number,
              itemLabel,
              awb
            )

      await sendWhatsAppTemplate({
        phone,
        userId: order.user_id,
        orderId: order.id,
        templateName,
        variables,
        urlButtonParam: getDelhiveryTrackingUrlButtonParam(awb),
      })
      return
    }

    const variables =
      flow === 'exchange'
        ? buildExchangePickupReceivedParams(
            order.order_number,
            itemLabel,
            formatItemVariant(item.exchange_size, item.exchange_color),
            getOrdersUrl()
          )
        : buildReturnPickupReceivedParams(
            order.order_number,
            itemLabel,
            getOrdersUrl()
          )

    await sendWhatsAppTemplate({
      phone,
      userId: order.user_id,
      orderId: order.id,
      templateName,
      variables,
    })
  } catch (error) {
    logger.error('Reverse pickup milestone WhatsApp failed', {
      error,
      orderId: order.id,
      milestone,
      templateName,
      pickupType,
    })
  }
}
