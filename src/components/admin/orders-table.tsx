'use client'

import { useState } from 'react'
import { Order, OrderItem, OrderStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatPrice, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  Truck,
  PackageCheck,
} from 'lucide-react'

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
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
  cancel_custom_reason?: string | null
  cancel_reason?: { label?: string } | null
  variant?: { sku?: string | null } | null
  product?: { sku?: string | null } | null
}

function getItemSku(item: AdminOrderItem): string | null {
  const variantSku = item.variant?.sku?.trim()
  if (variantSku) return variantSku

  const productSku = item.product?.sku?.trim()
  if (productSku) return productSku

  return null
}

function formatItemVariant(item: AdminOrderItem): string {
  const parts = [item.variant_size, item.variant_color].filter(Boolean)
  return parts.length ? parts.join(' / ') : '—'
}

function canProcessItemRefund(
  order: AdminOrder,
  item: AdminOrderItem
): boolean {
  if (item.refund_status === 'completed') return false

  const refundableState =
    (item.return_status === 'return_approved' &&
      item.return_type === 'return') ||
    item.status === 'cancelled'

  if (!refundableState) return false

  if (order.payment_method === 'cod') return true

  return order.payment_status === 'completed'
}

type AdminOrder = Omit<Order, 'items'> & {
  items?: AdminOrderItem[]
  user?: { full_name: string | null; email: string }
}

interface AdminOrdersTableProps {
  orders: AdminOrder[]
}

export function AdminOrdersTable({ orders: initialOrders }: AdminOrdersTableProps) {
  const [orders, setOrders] = useState(initialOrders)
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const filtered = orders.filter((o) => {
    if (selectedStatus !== 'all' && o.status !== selectedStatus) return false
    if (search && !o.order_number.toLowerCase().includes(search.toLowerCase()) &&
      !o.user?.email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId)
    try {
      const res = await fetch('/api/admin/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update status')
        return
      }
      setOrders(orders.map((o) => o.id === orderId ? { ...o, status } : o))
      toast.success('Order status updated')
    } catch {
      toast.error('Error updating order')
    } finally {
      setUpdatingId(null)
    }
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

      setOrders(
        orders.map((order) => ({
          ...order,
          items: order.items?.map(
            (item: AdminOrderItem) =>
              item.id === itemId
                ? {
                  ...item,
                  return_status:
                    'return_approved',
                }
                : item
          ),
        }))
      )

      toast.success(
        'Return approved'
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

      setOrders(
        orders.map((order) => ({
          ...order,
          items: order.items?.map(
            (item: AdminOrderItem) =>
              item.id === itemId
                ? {
                  ...item,
                  return_status:
                    'return_rejected',
                }
                : item
          ),
        }))
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
      } else {
        toast.success('Cancellation approved')
      }

      setOrders((prev) =>
        prev.map((order) => ({
          ...order,
          items: order.items?.map((item: AdminOrderItem) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'cancelled',
                  refund_status: data.refund ? 'completed' : item.refund_status,
                  refunded_amount: data.refund
                    ? item.total_price
                    : item.refunded_amount,
                }
              : item
          ),
        }))
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

  const handleShipment = async (order: Order) => {
    const shipment = Array.isArray(order.delhivery_shipment)
      ? order.delhivery_shipment[0]
      : order.delhivery_shipment
    const action = shipment?.awb ? 'sync' : 'create'

    try {
      setUpdatingId(order.id)
      const res = await fetch('/api/admin/orders/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, action }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Delhivery action failed')
        return
      }

      const awb = data.shipment?.awb || data.tracking?.awb || shipment?.awb
      const carrierStatus =
        data.shipment?.status || data.tracking?.currentStatus || shipment?.status

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                tracking_number: awb || item.tracking_number,
                status:
                  data.tracking?.currentStatus?.toLowerCase().includes('delivered')
                    ? 'delivered'
                    : awb && item.status === 'paid'
                      ? 'processing'
                      : item.status,
                delhivery_shipment: {
                  ...(shipment || {}),
                  awb,
                  status: carrierStatus,
                },
              }
            : item
        )
      )
      toast.success(action === 'create' ? `Shipment created: ${awb}` : 'Tracking synced')
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
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
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-gray-900">{formatPrice(order.total)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={order.payment_status === 'completed' ? 'success' : 'warning'}>
                      {order.payment_method} / {order.payment_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[order.status]}>
                      {order.status}
                    </Badge>
                    {(() => {
                      const shipment = Array.isArray(order.delhivery_shipment)
                        ? order.delhivery_shipment[0]
                        : order.delhivery_shipment
                      return shipment ? (
                        <div className="mt-2 text-xs text-gray-500">
                          <p>{shipment.status}</p>
                          {shipment.awb && <p className="font-mono">{shipment.awb}</p>}
                          {shipment.error_message && (
                            <p className="text-red-600">{shipment.error_message}</p>
                          )}
                        </div>
                      ) : null
                    })()}
                  </td>
                  <td className="px-4 py-3 min-w-[250px]">
                    <div className="space-y-2">
                      {order.items?.map((item: AdminOrderItem) => {
                        const sku = getItemSku(item)

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
                            Qty: {item.quantity} • {formatPrice(item.total_price)}
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
                                  <span className="font-medium">
                                    {item.return_type}
                                  </span>
                                </p>

                                {item.exchange_size && (
                                  <p>
                                    Exchange Size:{' '}
                                    {item.exchange_size}
                                  </p>
                                )}

                                {item.exchange_color && (
                                  <p>
                                    Exchange Color:{' '}
                                    {item.exchange_color}
                                  </p>
                                )}

                                {item.return_custom_reason && (
                                  <p>
                                    Reason:{' '}
                                    {item.return_custom_reason}
                                  </p>
                                )}
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
                                    Approve
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8"
                                    onClick={() =>
                                      rejectReturn(item.id)
                                    }
                                  >
                                    Reject
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
                    <select
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value as OrderStatus)}
                      disabled={updatingId === order.id || order.status === 'refunded'}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                    >
                      {STATUS_OPTIONS
                        .filter(
                          (s) =>
                            s.value !== 'shipped' &&
                            s.value !== 'delivered'
                        )
                        .map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">

                    <div className="flex items-center justify-end gap-2 flex-wrap">

                      {/* CREATE OR SYNC DELHIVERY SHIPMENT */}
                      {(order.status === 'processing' ||
                        order.status === 'paid' ||
                        order.status === 'shipped') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            updatingId === order.id
                          }
                          onClick={() =>
                            handleShipment(order)
                          }
                        >
                          <Truck className="h-4 w-4 mr-1" />
                          {order.tracking_number ? 'Sync' : 'Create Shipment'}
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
    </div>
  )
}
