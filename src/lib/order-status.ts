import type { OrderStatus } from '@/types'

export type FulfillmentStatus = Extract<
  OrderStatus,
  'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
>

type OrderLike = {
  status?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  tracking_number?: string | null
  payment_status?: string | null
}

type OrderItemLike = {
  status?: string | null
  return_status?: string | null
}

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

const ITEM_LEVEL_ORDER_STATUSES = new Set([
  'return_requested',
  'return_initiated',
  'returned',
  'exchange_initiated',
  'exchanged',
])

export function isItemCancelled(status?: string | null): boolean {
  return status === 'cancelled' || status === 'cancel_requested'
}

export function getActiveOrderItems<T extends OrderItemLike>(items: T[]): T[] {
  return items.filter((item) => !isItemCancelled(item.status))
}

export function canCancelOrderItem(
  item: OrderItemLike,
  order: OrderLike
): boolean {
  if (isItemCancelled(item.status)) return false
  if (item.return_status) return false

  return ['pending', 'paid', 'processing'].includes(order.status || '')
}

export function isOrderDelivered(order: OrderLike): boolean {
  return Boolean(order.delivered_at) || order.status === 'delivered'
}

export function canReturnOrExchangeOrderItem(
  item: OrderItemLike,
  order: OrderLike,
  isWithinReturnWindow: boolean
): boolean {
  if (isItemCancelled(item.status)) return false
  if (item.return_status) return false
  if (!isOrderDelivered(order)) return false

  return isWithinReturnWindow
}

export function getOrderFulfillmentStatus(
  order: OrderLike,
  items: OrderItemLike[]
): FulfillmentStatus {
  const activeItems = getActiveOrderItems(items)

  if (items.length > 0 && activeItems.length === 0) {
    return 'cancelled'
  }

  if (order.payment_status === 'refunded' || order.status === 'refunded') {
    return 'refunded'
  }

  if (order.delivered_at || order.status === 'delivered') {
    return 'delivered'
  }

  if (order.shipped_at || order.tracking_number || order.status === 'shipped') {
    return 'shipped'
  }

  const normalized = order.status || 'pending'

  if (
    ITEM_LEVEL_ORDER_STATUSES.has(normalized) ||
    normalized === 'cancelled'
  ) {
    return 'processing'
  }

  if (FULFILLMENT_STATUSES.includes(normalized as FulfillmentStatus)) {
    return normalized as FulfillmentStatus
  }

  return 'processing'
}

export function getItemActionStatus(item: OrderItemLike): string | null {
  if (item.return_status) {
    return item.return_status
  }

  if (
    item.status === 'cancelled' ||
    item.status === 'cancel_requested' ||
    item.status === 'return_initiated' ||
    item.status === 'exchange_initiated' ||
    item.status === 'returned' ||
    item.status === 'exchanged'
  ) {
    return item.status
  }

  return null
}

export function areAllOrderItemsCancelled(
  items: Array<{ status?: string | null }>
): boolean {
  return Boolean(items.length && items.every((item) => item.status === 'cancelled'))
}
