'use client'

import { useState } from 'react'
import { Order, OrderStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatPrice, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

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
}

interface AdminOrdersTableProps {
  orders: (Order & { user?: { full_name: string | null; email: string } })[]
}

export function AdminOrdersTable({ orders: initialOrders }: AdminOrdersTableProps) {
  const [orders, setOrders] = useState(initialOrders)
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const supabase = createClient()

  const filtered = orders.filter((o) => {
    if (selectedStatus !== 'all' && o.status !== selectedStatus) return false
    if (search && !o.order_number.toLowerCase().includes(search.toLowerCase()) &&
      !o.user?.email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId)
    try {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
      if (error) {
        toast.error('Failed to update status')
        return
      }
      setOrders(orders.map((o) => o.id === orderId ? { ...o, status } : o))
      toast.success('Order status updated')

      // Send status email
      await fetch('/api/admin/orders/status-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status }),
      })
    } catch {
      toast.error('Error updating order')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleRefund = async (order: Order) => {
    if (!order.payment?.stripe_payment_intent_id) {
      toast.error('No Stripe payment intent found')
      return
    }

    if (!confirm(`Refund ${formatPrice(order.total)} for order ${order.order_number}?`)) return

    try {
      const res = await fetch('/api/admin/orders/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      })

      if (res.ok) {
        toast.success('Refund initiated successfully')
        setOrders(orders.map((o) => o.id === order.id ? { ...o, status: 'refunded', payment_status: 'refunded' } : o))
      } else {
        const data = await res.json()
        toast.error(data.error || 'Refund failed')
      }
    } catch {
      toast.error('Refund request failed')
    }
  }

  const handleApproveCancel = async (itemId: string) => {
    try {
      const res = await fetch('/api/admin/orders/cancel-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to approve')
        return
      }

      toast.success('Cancellation approved')

      // ✅ UPDATE UI
      setOrders((prev) =>
        prev.map((order) => ({
          ...order,
          items: order.items?.map((item: any) =>
            item.id === itemId ? { ...item, status: 'cancelled' } : item
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
          items: order.items?.map((item: any) =>
            item.id === itemId ? { ...item, status: 'active' } : item
          ),
        }))
      )
    } catch {
      toast.error('Error rejecting cancellation')
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
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      {order.items?.map((item: any) => (
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

                          <p className="text-gray-500">
                            Qty: {item.quantity} • {formatPrice(item.total_price)}
                          </p>

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
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value as OrderStatus)}
                      disabled={updatingId === order.id || order.status === 'refunded'}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {order.payment_method === 'stripe' &&
                      order.payment_status === 'completed' &&
                      order.status !== 'refunded' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefund(order)}
                          className="text-red-600 hover:bg-red-50 text-xs"
                        >
                          Refund
                        </Button>
                      )}
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
