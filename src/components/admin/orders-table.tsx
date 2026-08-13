'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Order, OrderItem, OrderStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatPrice, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  Truck,
  PackageCheck,
  RefreshCw,
  Download,
} from 'lucide-react'
import {
  resolveItemPurchasePrice,
  type PurchasePriceProductInput,
} from '@/lib/purchase-price'
import { isDelhiveryRtoStatus } from '@/lib/delhivery-status'

const ADMIN_CANCEL_REASON_OPTIONS = [
  'Test order',
  'Shipping issue',
  'Bad address',
  'Customer not reachable',
  'Other',
] as const

type AdminCancelReasonOption = (typeof ADMIN_CANCEL_REASON_OPTIONS)[number]

const STATUS_OPTIONS: { value: OrderStatus | 'rto'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'rto', label: 'RTO (Delhivery)' },
]

const STATUS_BADGE: Record<OrderStatus, 'success' | 'warning' | 'info' | 'default' | 'destructive'> = {
  pending: 'warning',
  paid: 'info',
  processing: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'destructive',
  refunded: 'default',
  return_requested: 'warning',
  return_initiated: 'info',
  returned: 'success',
  exchange_initiated: 'info',
  exchanged: 'success',
}

type AdminOrderItem = OrderItem & {
  status?: string
  return_status?: string | null
  return_type?: string | null
  refund_method?: string | null
  refund_status?: string | null
  refunded_amount?: number | null
  exchange_size?: string | null
  exchange_color?: string | null
  return_custom_reason?: string | null
  seal_tag_image_url?: string | null
  product_front_image_url?: string | null
  product_back_image_url?: string | null
  bank_account?: {
    account_holder_name?: string | null
    bank_name?: string | null
    account_number?: string | null
    ifsc?: string | null
  } | null
  return_reason?: { id?: string; label?: string } | null
  cancel_custom_reason?: string | null
  cancel_reason?: { label?: string } | null
  variant?: { sku?: string | null } | null
  product?: (PurchasePriceProductInput & { sku?: string | null }) | null
}

function getItemSku(item: AdminOrderItem): string | null {
  const variantSku = item.variant?.sku?.trim()
  if (variantSku) return variantSku

  const productSku = item.product?.sku?.trim()
  if (productSku) return productSku

  return null
}

function getItemPurchasePrice(item: AdminOrderItem): number | null {
  return resolveItemPurchasePrice(item.product, item.product_name)
}

function getItemComparePrice(item: AdminOrderItem): number | null {
  const compare = item.product?.compare_price
  if (compare == null || !Number.isFinite(compare) || compare <= 0) return null
  return compare
}

function getOrderPurchaseTotal(order: { items?: AdminOrderItem[] }): number | null {
  const items = order.items || []
  if (!items.length) return null

  let total = 0
  let hasAny = false
  for (const item of items) {
    const unit = getItemPurchasePrice(item)
    if (unit == null) continue
    hasAny = true
    total += unit * (item.quantity || 0)
  }

  return hasAny ? Math.round(total * 100) / 100 : null
}

function getOrderCompareTotal(order: { items?: AdminOrderItem[] }): number | null {
  const items = order.items || []
  if (!items.length) return null

  let total = 0
  let hasAny = false
  for (const item of items) {
    const unit = getItemComparePrice(item)
    if (unit == null) continue
    hasAny = true
    total += unit * (item.quantity || 0)
  }

  return hasAny ? Math.round(total * 100) / 100 : null
}

function formatItemVariant(item: AdminOrderItem): string {
  const parts = [item.variant_size, item.variant_color].filter(Boolean)
  return parts.length ? parts.join(' / ') : '—'
}

function getCustomerPhone(order: AdminOrder): string | null {
  const profilePhone = order.user?.phone?.trim()
  if (profilePhone) return profilePhone

  const shippingPhone = (
    order.shipping_address as { phone?: string } | null | undefined
  )?.phone?.trim()
  if (shippingPhone) return shippingPhone

  return null
}

function getShippingAddressLines(order: AdminOrder): string[] {
  const addr = order.shipping_address as
    | {
        address_line1?: string
        address_line2?: string
        city?: string
        state?: string
        postal_code?: string
      }
    | null
    | undefined

  if (!addr) return []

  const street = [addr.address_line1, addr.address_line2]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')

  const region = [
    [addr.city, addr.state].map((part) => part?.trim()).filter(Boolean).join(', '),
    addr.postal_code?.trim(),
  ]
    .filter(Boolean)
    .join(' - ')

  return [street, region].filter(Boolean) as string[]
}

type DelhiveryShipmentInfo = {
  id?: string
  awb?: string | null
  status?: string | null
  status_code?: string | null
  status_type?: string | null
  instructions?: string | null
  expected_delivery_date?: string | null
  last_synced_at?: string | null
  error_message?: string | null
  cancellation_requested_at?: string | null
}

type DelhiveryReversePickupInfo = {
  id?: string
  order_item_id?: string
  pickup_type?: string | null
  awb?: string | null
  exchange_forward_awb?: string | null
  status?: string | null
  last_synced_at?: string | null
  error_message?: string | null
}

type AdminDelhiverySyncPayload = {
  orderId: string
  success: boolean
  orderStatus?: string
  carrierStatus?: string
  awb?: string | null
  lastSyncedAt?: string
  expectedDeliveryDate?: string | null
  error?: string
}

function getDelhiveryShipment(order: AdminOrder): DelhiveryShipmentInfo | null {
  const shipment = Array.isArray(order.delhivery_shipment)
    ? order.delhivery_shipment[0]
    : order.delhivery_shipment

  return shipment || null
}

function getReversePickupForItem(
  order: AdminOrder,
  itemId: string
): DelhiveryReversePickupInfo | null {
  const pickups = order.delhivery_reverse_pickups
  if (!pickups) return null

  const list = Array.isArray(pickups) ? pickups : [pickups]
  return list.find((pickup) => pickup.order_item_id === itemId) || null
}

function isDelhiveryManagedStatus(status: OrderStatus): boolean {
  return status === 'shipped' || status === 'delivered'
}

function canSyncDelhivery(order: AdminOrder): boolean {
  if (['cancelled', 'refunded'].includes(order.status)) return false

  const shipment = getDelhiveryShipment(order)
  return Boolean(shipment?.awb || order.tracking_number)
}

function canProcessItemRefund(
  order: AdminOrder,
  item: AdminOrderItem
): boolean {
  if (item.refund_status === 'completed') return false

  const refundableState =
    (item.return_status === 'return_approved' &&
      item.return_type === 'return' &&
      item.status === 'returned') ||
    item.status === 'cancelled'

  if (!refundableState) return false

  if (order.payment_method === 'cod') return true

  return order.payment_status === 'completed'
}

type AdminOrder = Omit<Order, 'items' | 'delhivery_shipment'> & {
  items?: AdminOrderItem[]
  user?: { full_name: string | null; email: string; phone?: string | null }
  delhivery_shipment?: DelhiveryShipmentInfo | DelhiveryShipmentInfo[] | null
  delhivery_reverse_pickups?:
    | DelhiveryReversePickupInfo
    | DelhiveryReversePickupInfo[]
    | null
}

interface AdminOrdersTableProps {
  orders: AdminOrder[]
}

export function AdminOrdersTable({ orders: initialOrders }: AdminOrdersTableProps) {
  const searchParams = useSearchParams()
  const statusFromUrl = searchParams.get('status')
  const [orders, setOrders] = useState(initialOrders)
  const [selectedStatus, setSelectedStatus] = useState<string>(
    statusFromUrl || 'all'
  )
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [syncingTracking, setSyncingTracking] = useState(false)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [cancelModalOrder, setCancelModalOrder] = useState<AdminOrder | null>(
    null
  )
  const [cancelReasonOption, setCancelReasonOption] =
    useState<AdminCancelReasonOption | ''>('')
  const [cancelCustomReason, setCancelCustomReason] = useState('')
  const autoSyncedRef = useRef(false)

  useEffect(() => {
    if (statusFromUrl) setSelectedStatus(statusFromUrl)
  }, [statusFromUrl])

  const applyDelhiverySyncResults = useCallback(
    (results: AdminDelhiverySyncPayload[]) => {
      setOrders((current) =>
        current.map((order) => {
          const result = results.find(
            (entry) => entry.orderId === order.id && entry.success
          )
          if (!result) return order

          const existingShipment = getDelhiveryShipment(order)

          return {
            ...order,
            status: (result.orderStatus as OrderStatus) || order.status,
            tracking_number: result.awb || order.tracking_number,
            delhivery_shipment: existingShipment
              ? {
                  ...existingShipment,
                  awb: result.awb || existingShipment.awb,
                  status: result.carrierStatus || existingShipment.status,
                  last_synced_at:
                    result.lastSyncedAt || existingShipment.last_synced_at,
                  expected_delivery_date:
                    result.expectedDeliveryDate ??
                    existingShipment.expected_delivery_date,
                  error_message: null,
                }
              : result.awb
                ? {
                    awb: result.awb,
                    status: result.carrierStatus,
                    last_synced_at: result.lastSyncedAt,
                    expected_delivery_date: result.expectedDeliveryDate,
                  }
                : order.delhivery_shipment,
          }
        })
      )
    },
    []
  )

  const refreshDelhiveryTracking = useCallback(
    async (orderIds: string[], options?: { silent?: boolean }) => {
      if (!orderIds.length) {
        if (!options?.silent) {
          toast('No Delhivery shipments to sync')
        }
        return
      }

      setSyncingTracking(true)
      try {
        const res = await fetch('/api/admin/orders/sync-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_ids: orderIds }),
        })
        const data = await res.json()

        if (!res.ok) {
          toast.error(data.error || 'Failed to sync Delhivery tracking')
          return
        }

        applyDelhiverySyncResults(data.results || [])

        if (!options?.silent) {
          const synced = data.synced ?? 0
          const failed = data.failed ?? 0
          if (failed > 0) {
            toast.error(`Synced ${synced} order(s), ${failed} failed`)
          } else {
            toast.success(`Updated tracking for ${synced} order(s)`)
          }
        }
      } catch {
        if (!options?.silent) {
          toast.error('Failed to sync Delhivery tracking')
        }
      } finally {
        setSyncingTracking(false)
      }
    },
    [applyDelhiverySyncResults]
  )

  useEffect(() => {
    if (autoSyncedRef.current) return
    autoSyncedRef.current = true

    const orderIds = initialOrders
      .filter((order) => {
        const shipment = getDelhiveryShipment(order)
        return (
          shipment?.awb &&
          !['delivered', 'cancelled', 'refunded'].includes(order.status)
        )
      })
      .slice(0, 25)
      .map((order) => order.id)

    if (orderIds.length) {
      void refreshDelhiveryTracking(orderIds, { silent: true })
    }
  }, [initialOrders, refreshDelhiveryTracking])

  const filtered = orders.filter((o) => {
    if (selectedStatus === 'rto') {
      const shipment = getDelhiveryShipment(o)
      if (
        !isDelhiveryRtoStatus(
          shipment?.status || '',
          shipment?.status_type,
          shipment?.instructions
        )
      ) {
        return false
      }
    } else if (selectedStatus !== 'all' && o.status !== selectedStatus) {
      return false
    }
    if (search && !o.order_number.toLowerCase().includes(search.toLowerCase()) &&
      !o.user?.email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const exportOrdersExcel = async () => {
    if (!exportFrom || !exportTo) {
      toast.error('Select from and to dates for the report')
      return
    }

    if (exportFrom > exportTo) {
      toast.error('From date must be on or before to date')
      return
    }

    setExporting(true)
    try {
      const params = new URLSearchParams({
        from: exportFrom,
        to: exportTo,
      })
      const res = await fetch(`/api/admin/orders/export?${params.toString()}`)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to export orders')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `orders-${exportFrom}-to-${exportTo}.xls`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.success('Orders Excel report downloaded')
    } catch {
      toast.error('Failed to export orders')
    } finally {
      setExporting(false)
    }
  }

  const updateStatus = async (
    orderId: string,
    status: OrderStatus,
    cancelReason?: string
  ) => {
    setUpdatingId(orderId)
    try {
      const res = await fetch('/api/admin/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status,
          ...(status === 'cancelled' ? { cancel_reason: cancelReason } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update status')
        return false
      }
      setOrders(
        orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status,
                cancel_reason:
                  status === 'cancelled' ? cancelReason || null : null,
                cancelled_at:
                  status === 'cancelled'
                    ? o.cancelled_at || new Date().toISOString()
                    : o.cancelled_at,
              }
            : o
        )
      )
      toast.success('Order status updated')
      return true
    } catch {
      toast.error('Error updating order')
      return false
    } finally {
      setUpdatingId(null)
    }
  }

  const openCancelModal = (order: AdminOrder) => {
    setCancelModalOrder(order)
    setCancelReasonOption('')
    setCancelCustomReason('')
  }

  const closeCancelModal = () => {
    setCancelModalOrder(null)
    setCancelReasonOption('')
    setCancelCustomReason('')
  }

  const confirmAdminCancel = async () => {
    if (!cancelModalOrder) return

    if (!cancelReasonOption) {
      toast.error('Select a cancel reason')
      return
    }

    if (cancelReasonOption === 'Other' && !cancelCustomReason.trim()) {
      toast.error('Enter a custom cancel reason')
      return
    }

    const reason =
      cancelReasonOption === 'Other'
        ? cancelCustomReason.trim()
        : cancelReasonOption

    const ok = await updateStatus(cancelModalOrder.id, 'cancelled', reason)
    if (ok) closeCancelModal()
  }

  const handleRefund = async (order: AdminOrder) => {
    if (order.payment_status !== 'completed' && order.payment_method !== 'cod') {
      toast.error('Only paid orders can be refunded')
      return
    }

    if (
      !confirm(
        `Refund all remaining items for order ${order.order_number}? The amount will be returned to the original payment method in 5-7 business days.`
      )
    ) {
      return
    }

    try {
      const res = await fetch('/api/admin/orders/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Refund failed')
        return
      }

      toast.success(data.message || 'Refund initiated successfully')
      setOrders(
        orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: 'refunded',
                payment_status: 'refunded',
                items: o.items?.map((item) => ({
                  ...item,
                  refund_status: 'completed',
                  refunded_amount: item.total_price,
                })),
              }
            : o
        )
      )
    } catch {
      toast.error('Refund request failed')
    }
  }

  const processItemRefund = async (orderId: string, item: AdminOrderItem) => {
    const refundTarget =
      item.refund_method === 'bank'
        ? 'the customer bank account'
        : 'the original payment method'

    if (
      !confirm(
        `Refund ${formatPrice(item.total_price)} for ${item.product_name} to ${refundTarget}?`
      )
    ) {
      return
    }

    try {
      const res = await fetch('/api/admin/orders/refund-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Refund failed')
        return
      }

      toast.success(
        data.message ||
          'Refund initiated. Amount will reflect in 5-7 business days.'
      )

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                items: order.items?.map((row) =>
                  row.id === item.id
                    ? {
                        ...row,
                        refund_status: 'completed',
                        refunded_amount: item.total_price,
                        status:
                          row.return_type === 'exchange'
                            ? row.status
                            : 'returned',
                      }
                    : row
                ),
              }
            : order
        )
      )
    } catch {
      toast.error('Refund request failed')
    }
  }

  const approveReturn = async (
    itemId: string
  ) => {
    try {
      const res = await fetch(
        '/api/admin/orders/approve-return',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            item_id: itemId,
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        toast.error(
          data.error ||
          'Failed to approve'
        )
        return
      }

      setOrders((current) =>
        current.map((order) => {
          const hasItem = order.items?.some((item) => item.id === itemId)
          if (!hasItem) return order

          const targetItem = order.items?.find((item) => item.id === itemId)
          const isExchange = targetItem?.return_type === 'exchange'

          return {
            ...order,
            // Keep order-level fulfillment status (e.g. delivered).
            // Return/exchange state lives on the item + reverse pickup.
            items: order.items?.map((item: AdminOrderItem) =>
              item.id === itemId
                ? {
                    ...item,
                    return_status: 'return_approved',
                    status: isExchange
                      ? 'exchange_initiated'
                      : 'return_initiated',
                  }
                : item
            ),
            delhivery_reverse_pickups: [
              ...(Array.isArray(order.delhivery_reverse_pickups)
                ? order.delhivery_reverse_pickups
                : order.delhivery_reverse_pickups
                  ? [order.delhivery_reverse_pickups]
                  : []),
              {
                order_item_id: itemId,
                pickup_type: isExchange ? 'exchange' : 'return',
                awb: data.delhivery?.reverseAwb || null,
                exchange_forward_awb:
                  data.delhivery?.exchangeForwardAwb || null,
                status: 'Scheduled',
              },
            ],
          }
        })
      )

      const reverseAwb = data.delhivery?.reverseAwb
      const exchangeAwb = data.delhivery?.exchangeForwardAwb
      toast.success(
        reverseAwb
          ? `Return approved. Reverse AWB: ${reverseAwb}${
              exchangeAwb ? `, Exchange AWB: ${exchangeAwb}` : ''
            }`
          : 'Return approved'
      )
    } catch {
      toast.error(
        'Failed to approve return'
      )
    }
  }

  const rejectReturn = async (
    itemId: string
  ) => {
    try {
      const res = await fetch(
        '/api/admin/orders/reject-return',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            item_id: itemId,
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        toast.error(
          data.error ||
          'Failed to reject'
        )
        return
      }

      setOrders((current) =>
        current.map((order) => {
          const hasItem = order.items?.some((item) => item.id === itemId)
          if (!hasItem) return order

          return {
            ...order,
            items: order.items?.map((item: AdminOrderItem) =>
              item.id === itemId
                ? {
                    ...item,
                    return_status: 'return_rejected',
                  }
                : item
            ),
          }
        })
      )

      toast.success(
        'Return rejected'
      )
    } catch {
      toast.error(
        'Failed to reject return'
      )
    }
  }

  const handleApproveCancel = async (itemId: string) => {
    try {
      const res = await fetch('/api/admin/orders/cancel-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to approve')
        return
      }

      if (data.refund_error) {
        toast.error(`Cancellation approved, but refund failed: ${data.refund_error}`)
      } else if (data.refund) {
        toast.success('Cancellation approved and refund initiated')
      } else if (data.delhivery && !data.delhivery.ok && !data.delhivery.skipped) {
        toast.success(
          'Cancellation approved. Order marked cancelled — Delhivery cancel needs follow-up.'
        )
      } else {
        toast.success('Cancellation approved')
      }

      setOrders((prev) =>
        prev.map((order) => {
          const items = order.items?.map((item: AdminOrderItem) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'cancelled' as const,
                  refund_status: data.refund ? 'completed' : item.refund_status,
                  refunded_amount: data.refund
                    ? item.total_price
                    : item.refunded_amount,
                }
              : item
          )

          const fullyCancelled =
            data.all_items_cancelled ||
            (items?.length
              ? items.every((item) => item.status === 'cancelled')
              : false)

          return {
            ...order,
            items,
            status: fullyCancelled ? 'cancelled' : order.status,
            cancelled_at: fullyCancelled
              ? order.cancelled_at || new Date().toISOString()
              : order.cancelled_at,
          }
        })
      )
    } catch {
      toast.error('Error approving cancellation')
    }
  }

  const handleRejectCancel = async (itemId: string) => {
    try {
      const res = await fetch('/api/admin/orders/cancel-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to reject')
        return
      }

      toast.success('Cancellation rejected')

      // UPDATE UI
      setOrders((prev) =>
        prev.map((order) => ({
          ...order,
          items: order.items?.map((item: AdminOrderItem) =>
            item.id === itemId ? { ...item, status: 'active' } : item
          ),
        }))
      )
    } catch {
      toast.error('Error rejecting cancellation')
    }
  }

  const handleShipment = async (order: AdminOrder) => {
    const shipment = Array.isArray(order.delhivery_shipment)
      ? order.delhivery_shipment[0]
      : order.delhivery_shipment
    const action = shipment?.awb ? 'sync' : 'create'

    try {
      setUpdatingId(order.id)

      // Clear stale error text immediately so a previous Embargo message
      // doesn't keep showing while the new attempt runs.
      if (action === 'create') {
        setOrders((current) =>
          current.map((item) =>
            item.id === order.id
              ? {
                  ...item,
                  delhivery_shipment: {
                    ...(shipment || {}),
                    status: 'creating',
                    error_message: null,
                  },
                }
              : item
          )
        )
      }

      const res = await fetch('/api/admin/orders/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, action }),
      })
      const data = await res.json()

      if (!res.ok) {
        const errorMessage = data.error || 'Delhivery action failed'
        setOrders((current) =>
          current.map((item) =>
            item.id === order.id
              ? {
                  ...item,
                  delhivery_shipment: {
                    ...(getDelhiveryShipment(item) || shipment || {}),
                    status: 'creation_failed',
                    error_message: errorMessage,
                  },
                }
              : item
          )
        )
        toast.error(errorMessage)
        return
      }

      const awb =
        data.shipment?.awb ||
        data.delhivery_shipment?.awb ||
        data.tracking?.awb ||
        shipment?.awb
      const carrierStatus =
        data.carrierStatus ||
        data.shipment?.status ||
        data.delhivery_shipment?.status ||
        data.tracking?.currentStatus ||
        shipment?.status
      const orderStatus = data.orderStatus || data.order?.status

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                tracking_number: awb || item.tracking_number,
                status: (orderStatus as OrderStatus) || item.status,
                delhivery_shipment: {
                  ...(shipment || {}),
                  awb,
                  status: carrierStatus,
                  last_synced_at:
                    data.shipment?.last_synced_at ||
                    data.delhivery_shipment?.last_synced_at ||
                    new Date().toISOString(),
                  expected_delivery_date:
                    data.shipment?.expected_delivery_date ||
                    data.delhivery_shipment?.expected_delivery_date ||
                    shipment?.expected_delivery_date,
                  error_message: null,
                },
              }
            : item
        )
      )
      toast.success(
        action === 'create'
          ? `Shipment created${awb ? `: ${awb}` : ''}`
          : `Tracking synced${orderStatus ? ` → ${orderStatus}` : ''}`
      )
    } catch {
      toast.error('Delhivery action failed')
    } finally {
      setUpdatingId(null)
    }
  }

const markDelivered =
  async (orderId: string) => {

    try {

      setUpdatingId(orderId)

      const res =
        await fetch(
          '/api/admin/orders/mark-delivered',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              orderId,
            }),
          }
        )

      const data =
        await res.json()

      if (!res.ok) {

        toast.error(
          data.error ||
          'Failed to mark delivered'
        )

        return
      }

      setOrders(
        orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'delivered',
                payment_status:
                  o.payment_method === 'cod'
                    ? 'completed'
                    : o.payment_status,
              }
            : o
        )
      )

      toast.success(
        'Order marked as delivered'
      )

    } catch {

      toast.error(
        'Failed to update order'
      )

    } finally {

      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="search"
            placeholder="Search order # or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={syncingTracking}
            onClick={() =>
              refreshDelhiveryTracking(
                orders
                  .filter((order) => canSyncDelhivery(order))
                  .slice(0, 50)
                  .map((order) => order.id)
              )
            }
            className="shrink-0"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${syncingTracking ? 'animate-spin' : ''}`}
            />
            Sync Delhivery
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              From date
            </label>
            <input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              To date
            </label>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            loading={exporting}
            disabled={exporting}
            onClick={exportOrdersExcel}
            className="shrink-0"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden max-w-full">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Compare Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Purchase Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Payment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Items</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Update Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 min-w-[200px]">
                    <p className="font-medium text-gray-900">{order.order_number}</p>
                    <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{order.user?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{order.user?.email}</p>
                    <p className="text-xs text-blue-500 mt-0.5">
                      {getCustomerPhone(order) || 'no phone detail found'}
                    </p>
                    {getShippingAddressLines(order).map((line, index) => (
                      <p
                        key={index}
                        className="text-xs text-gray-500 mt-0.5 max-w-[220px]"
                      >
                        {line}
                      </p>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-gray-900">{formatPrice(order.total)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const compareTotal = getOrderCompareTotal(order)
                      return compareTotal != null ? (
                        <span className="font-bold text-gray-700">
                          {formatPrice(compareTotal)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const purchaseTotal = getOrderPurchaseTotal(order)
                      return purchaseTotal != null ? (
                        <span className="font-bold text-emerald-700">
                          {formatPrice(purchaseTotal)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={order.payment_status === 'completed' ? 'success' : 'warning'}>
                      {order.payment_method === 'cod' &&
                      Number(order.cod_advance_amount || order.shipping_amount) > 0
                        ? 'partial COD'
                        : order.payment_method}{' '}
                      / {order.payment_status}
                    </Badge>
                    {order.payment_method === 'cod' &&
                      Number(order.cod_advance_amount || 0) > 0 && (
                        <p className="mt-1 text-[11px] text-gray-500 max-w-[180px]">
                          {formatPrice(Number(order.cod_advance_amount))} paid ·{' '}
                          {formatPrice(
                            Number(
                              order.cod_collect_amount ||
                                Math.max(
                                  0,
                                  Number(order.total) -
                                    Number(order.cod_advance_amount || 0)
                                )
                            )
                          )}{' '}
                          due on delivery
                        </p>
                      )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[order.status]}>
                      {order.status}
                    </Badge>
                    {(() => {
                      const shipment = getDelhiveryShipment(order)
                      const hasAwb = Boolean(
                        shipment?.awb || order.tracking_number
                      )
                      const hasError = Boolean(shipment?.error_message)
                      const failedWithoutAwb =
                        !hasAwb &&
                        (shipment?.status === 'creation_failed' ||
                          shipment?.status === 'creating' ||
                          hasError)
                      const isRto = isDelhiveryRtoStatus(
                        shipment?.status || '',
                        shipment?.status_type,
                        shipment?.instructions
                      )

                      if (!hasAwb && !failedWithoutAwb) return null

                      return (
                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                          {isRto && (
                            <Badge variant="destructive" className="mb-1">
                              RTO — customer refused / returning
                            </Badge>
                          )}
                          <p
                            className={`font-medium ${
                              isRto ? 'text-red-700' : 'text-gray-700'
                            }`}
                          >
                            Delhivery:{' '}
                            {shipment?.status ||
                              (hasAwb ? 'Awaiting sync' : 'Not created')}
                          </p>
                          {hasAwb && (
                            <p className="font-mono">
                              AWB: {shipment?.awb || order.tracking_number}
                            </p>
                          )}
                          {shipment?.expected_delivery_date && !isRto && (
                            <p>
                              ETA:{' '}
                              {formatDate(shipment.expected_delivery_date)}
                            </p>
                          )}
                          {shipment?.last_synced_at && (
                            <p>
                              Synced: {formatDate(shipment.last_synced_at)}
                            </p>
                          )}
                          {shipment?.error_message && (
                            <p className="text-red-600 max-w-[220px]">
                              {shipment.error_message}
                            </p>
                          )}
                          {failedWithoutAwb && !shipment?.error_message && (
                            <p className="text-amber-600 max-w-[220px]">
                              Shipment not created yet — use Create Shipment to
                              retry.
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 min-w-[250px]">
                    <div className="space-y-2">
                      {order.items?.map((item: AdminOrderItem) => {
                        const sku = getItemSku(item)
                        const purchasePrice = getItemPurchasePrice(item)

                        return (
                        <div key={item.id} className="text-xs border rounded p-2 bg-gray-50">
                          {
                            item.status === 'cancelled' ? (
                              <Badge variant="destructive" className="mb-1">Cancelled</Badge>
                            ) : item.status === 'cancel_requested' ? (
                              <Badge variant="warning" className="mb-1">Cancel Requested</Badge>
                            ) : null
                          }
                          <p className="font-medium text-gray-800">
                            {item.product_name}
                          </p>

                          {sku && (
                            <p className="bg-black p-1 w-max text-white font-bold font-mono text-[11px] mt-0.5">
                              SKU: {sku}
                            </p>
                          )}

                          <p className="text-gray-500">
                            Size / Color: <br />{formatItemVariant(item)}
                          </p>

                          <p className="text-gray-500">
                            Qty: {item.quantity} • Sell: {formatPrice(item.total_price)}
                          </p>

                          <p className="text-gray-500">
                            Compare:{' '}
                            {item.product?.compare_price != null &&
                            item.product.compare_price > 0
                              ? formatPrice(item.product.compare_price)
                              : '—'}
                          </p>

                          <p className="mt-1 font-semibold text-emerald-700">
                            Purchase:{' '}
                            {purchasePrice != null
                              ? `${formatPrice(purchasePrice)}${
                                  item.quantity > 1
                                    ? ` × ${item.quantity} = ${formatPrice(
                                        purchasePrice * item.quantity
                                      )}`
                                    : ''
                                }`
                              : '—'}
                          </p>

                          {item.refund_status && (
                            <p
                              className={`mt-1 font-medium ${
                                item.refund_status === 'completed'
                                  ? 'text-green-600'
                                  : item.refund_status === 'failed'
                                    ? 'text-red-600'
                                    : 'text-orange-600'
                              }`}
                            >
                              Refund: {item.refund_status.replace(/_/g, ' ')}
                              {item.refunded_amount
                                ? ` • ${formatPrice(item.refunded_amount)}`
                                : ''}
                            </p>
                          )}

                          {item.refund_method && (
                            <p className="text-gray-500">
                              Refund to:{' '}
                              {item.refund_method === 'bank'
                                ? 'Bank account'
                                : item.refund_method === 'store_credit'
                                  ? 'Store credit'
                                  : 'Original payment source'}
                            </p>
                          )}

                          {/* CANCEL REASON */}
                          {item.status === 'cancelled' && (
                            <p className="text-red-500 mt-1">
                              Reason:{' '}
                              {item.cancel_reason?.label || item.cancel_custom_reason}
                            </p>
                          )}

                          {/* CANCEL REQUEST STATE */}
                          {item.status === 'cancel_requested' && (
                            <div className="mt-2 space-y-2">

                              <p className="text-orange-500">
                                Cancellation Requested
                              </p>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="text-xs px-2 py-1"
                                  onClick={() => handleApproveCancel(item.id)}
                                >
                                  Approve
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs px-2 py-1"
                                  onClick={() => handleRejectCancel(item.id)}
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* RETURN STATUS */}
                          {item.return_status && (
                            <div className="mt-2 border-t pt-2">

                              <Badge
                                variant={
                                  item.return_status ===
                                  'return_requested'
                                    ? 'warning'
                                    : item.return_status ===
                                      'return_approved'
                                    ? 'success'
                                    : item.return_status ===
                                      'return_rejected'
                                    ? 'destructive'
                                    : 'default'
                                }
                              >
                                {item.return_status
                                  .replace(/_/g, ' ')
                                  .toUpperCase()}
                              </Badge>

                              <div className="mt-2 text-xs space-y-1 text-gray-600">

                                <p>
                                  Type:{' '}
                                  <span className="font-medium capitalize">
                                    {item.return_type}
                                  </span>
                                </p>

                                <p>
                                  Reason:{' '}
                                  <span className="font-medium">
                                    {item.return_reason?.label ||
                                      item.return_custom_reason ||
                                      '—'}
                                  </span>
                                </p>

                                {item.exchange_size || item.exchange_color ? (
                                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1">
                                    <p className="font-medium text-amber-900">
                                      Exchange variant
                                    </p>
                                    <p>
                                      <span className="text-gray-500">
                                        Delivered:
                                      </span>{' '}
                                      {[item.variant_size, item.variant_color]
                                        .filter(Boolean)
                                        .join(' / ') || '—'}
                                    </p>
                                    <p>
                                      <span className="text-gray-500">
                                        Customer wants:
                                      </span>{' '}
                                      <span className="font-semibold text-gray-900">
                                        {[item.exchange_size, item.exchange_color]
                                          .filter(Boolean)
                                          .join(' / ') || '—'}
                                      </span>
                                    </p>
                                  </div>
                                ) : null}

                                {item.refund_method === 'bank' &&
                                  item.bank_account && (
                                    <div className="mt-2 rounded-lg border bg-gray-50 p-2 space-y-0.5">
                                      <p className="font-medium text-gray-800">
                                        Refund bank account
                                      </p>
                                      {item.bank_account.account_holder_name && (
                                        <p>
                                          Holder:{' '}
                                          {item.bank_account.account_holder_name}
                                        </p>
                                      )}
                                      {item.bank_account.bank_name && (
                                        <p>
                                          Bank: {item.bank_account.bank_name}
                                        </p>
                                      )}
                                      {item.bank_account.account_number && (
                                        <p>
                                          A/C:{' '}
                                          {item.bank_account.account_number}
                                        </p>
                                      )}
                                      {item.bank_account.ifsc && (
                                        <p>IFSC: {item.bank_account.ifsc}</p>
                                      )}
                                    </div>
                                  )}

                                {(item.seal_tag_image_url ||
                                  item.product_front_image_url ||
                                  item.product_back_image_url) && (
                                  <div className="mt-2 space-y-2">
                                    <p className="font-medium text-gray-800">
                                      Return photos
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                      {item.seal_tag_image_url && (
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-gray-500">
                                            Seal tag
                                          </p>
                                          <a
                                            href={item.seal_tag_image_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block"
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={item.seal_tag_image_url}
                                              alt="Seal tag with product"
                                              className="h-28 w-auto max-w-[140px] rounded-lg border object-cover"
                                            />
                                          </a>
                                        </div>
                                      )}
                                      {item.product_front_image_url && (
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-gray-500">
                                            Front
                                          </p>
                                          <a
                                            href={item.product_front_image_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block"
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={item.product_front_image_url}
                                              alt="Product front"
                                              className="h-28 w-auto max-w-[140px] rounded-lg border object-cover"
                                            />
                                          </a>
                                        </div>
                                      )}
                                      {item.product_back_image_url && (
                                        <div className="space-y-1">
                                          <p className="text-[11px] text-gray-500">
                                            Back
                                          </p>
                                          <a
                                            href={item.product_back_image_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block"
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={item.product_back_image_url}
                                              alt="Product back"
                                              className="h-28 w-auto max-w-[140px] rounded-lg border object-cover"
                                            />
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-gray-400">
                                      Click to open full size
                                    </p>
                                  </div>
                                )}

                                {(() => {
                                  const reversePickup = getReversePickupForItem(
                                    order,
                                    item.id
                                  )
                                  if (!reversePickup?.awb) return null

                                  return (
                                    <div className="mt-2 space-y-1">
                                      <p>
                                        Reverse AWB:{' '}
                                        <span className="font-mono font-medium">
                                          {reversePickup.awb}
                                        </span>
                                      </p>
                                      {reversePickup.exchange_forward_awb && (
                                        <p>
                                          Exchange AWB:{' '}
                                          <span className="font-mono font-medium">
                                            {reversePickup.exchange_forward_awb}
                                          </span>
                                        </p>
                                      )}
                                      {reversePickup.status && (
                                        <p>
                                          Carrier: {reversePickup.status}
                                        </p>
                                      )}
                                      {reversePickup.error_message && (
                                        <p className="text-red-600">
                                          {reversePickup.error_message}
                                        </p>
                                      )}
                                    </div>
                                  )
                                })()}
                              </div>

                              {/* APPROVE / REJECT */}
                              {item.return_status ===
                                'return_requested' && (
                                <div className="flex gap-2 mt-3">

                                  <Button
                                    size="sm"
                                    className="h-8"
                                    onClick={() =>
                                      approveReturn(item.id)
                                    }
                                  >
                                    {item.return_type === 'exchange'
                                      ? 'Approve Exchange'
                                      : 'Approve Return'}
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8"
                                    onClick={() =>
                                      rejectReturn(item.id)
                                    }
                                  >
                                    {item.return_type === 'exchange'
                                      ? 'Reject Exchange'
                                      : 'Reject Return'}
                                  </Button>
                                </div>
                              )}

                              {canProcessItemRefund(order, item) && (
                                <div className="mt-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-red-600 border-red-200"
                                    onClick={() =>
                                      processItemRefund(order.id, item)
                                    }
                                  >
                                    Process Refund
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}

                          {!item.return_status &&
                            canProcessItemRefund(order, item) && (
                              <div className="mt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-red-600 border-red-200"
                                  onClick={() =>
                                    processItemRefund(order.id, item)
                                  }
                                >
                                  Process Refund
                                </Button>
                              </div>
                            )}
                        </div>
                      )})}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isDelhiveryManagedStatus(order.status) ? (
                      <div className="space-y-1">
                        <Badge variant={STATUS_BADGE[order.status]}>
                          {order.status}
                        </Badge>
                        <p className="text-[11px] text-gray-500">
                          Updated from Delhivery
                        </p>
                        {order.status === 'cancelled' && order.cancel_reason && (
                          <p className="text-[11px] text-red-700 max-w-[180px]">
                            Reason: {order.cancel_reason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <select
                          value={order.status}
                          onChange={(e) => {
                            const next = e.target.value as OrderStatus
                            if (next === 'cancelled') {
                              openCancelModal(order)
                              return
                            }
                            updateStatus(order.id, next)
                          }}
                          disabled={
                            updatingId === order.id ||
                            order.status === 'refunded'
                          }
                          className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                        >
                          {STATUS_OPTIONS.filter(
                            (s) =>
                              s.value !== 'shipped' &&
                              s.value !== 'delivered' &&
                              s.value !== 'rto'
                          ).map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {order.status === 'cancelled' && order.cancel_reason && (
                          <p className="text-[11px] text-red-700 max-w-[180px]">
                            Reason: {order.cancel_reason}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">

                    <div className="flex items-center justify-end gap-2 flex-wrap">

                      {/* CREATE OR SYNC DELHIVERY SHIPMENT */}
                      {(order.status === 'processing' ||
                        order.status === 'paid' ||
                        order.status === 'shipped' ||
                        canSyncDelhivery(order)) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            updatingId === order.id || syncingTracking
                          }
                          onClick={() =>
                            handleShipment(order)
                          }
                        >
                          <Truck className="h-4 w-4 mr-1" />
                          {order.tracking_number || getDelhiveryShipment(order)?.awb
                            ? 'Sync'
                            : 'Create Shipment'}
                        </Button>
                      )}

                      {/* MARK DELIVERED */}
                      {order.status === 'shipped' && (
                        <Button
                          size="sm"
                          disabled={
                            updatingId === order.id
                          }
                          onClick={() =>
                            markDelivered(order.id)
                          }
                        >
                          <PackageCheck className="h-4 w-4 mr-1" />
                          Deliver
                        </Button>
                      )}

                      {/* FULL ORDER REFUND */}
                      {order.payment_status === 'completed' &&
                        order.status !== 'refunded' &&
                        order.items?.some(
                          (item) => item.refund_status !== 'completed'
                        ) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefund(order)}
                          className="text-red-600 hover:bg-red-50 text-xs"
                        >
                          Refund All
                        </Button>
                      )}

                    </div>

                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-400">No orders found</div>
        )}
      </div>

      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div>
              <h2 className="font-semibold text-lg">Cancel Order</h2>
              <p className="text-sm text-gray-500 mt-1">
                Select a reason for cancelling{' '}
                <span className="font-medium text-gray-700">
                  {cancelModalOrder.order_number}
                </span>
                .
              </p>
            </div>

            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={cancelReasonOption}
              onChange={(e) =>
                setCancelReasonOption(
                  e.target.value as AdminCancelReasonOption | ''
                )
              }
              disabled={updatingId === cancelModalOrder.id}
            >
              <option value="">Select reason</option>
              {ADMIN_CANCEL_REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>

            {cancelReasonOption === 'Other' && (
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[90px]"
                placeholder="Enter custom reason..."
                value={cancelCustomReason}
                onChange={(e) => setCancelCustomReason(e.target.value)}
                disabled={updatingId === cancelModalOrder.id}
              />
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={closeCancelModal}
                disabled={updatingId === cancelModalOrder.id}
              >
                Close
              </Button>
              <Button
                variant="destructive"
                onClick={confirmAdminCancel}
                loading={updatingId === cancelModalOrder.id}
              >
                Confirm Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
