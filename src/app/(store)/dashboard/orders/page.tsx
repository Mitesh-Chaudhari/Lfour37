import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Package, FileDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import { OrderStatus } from '@/types'
import { OptimizedImage } from '@/components/ui/optimized-image'
import OrderItemActions from '@/components/order/order-item-actions'
import ReturnItemActions from '@/components/order/return-item-action'
import { OrderItemStatusBadge } from '@/components/order/order-item-status-badge'

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string
    color:
    | 'success'
    | 'warning'
    | 'info'
    | 'default'
    | 'destructive'
  }
> = {
  pending: {
    label: 'Pending',
    color: 'warning',
  },

  paid: {
    label: 'Paid',
    color: 'info',
  },

  processing: {
    label: 'Processing',
    color: 'info',
  },

  shipped: {
    label: 'Shipped',
    color: 'info',
  },

  delivered: {
    label: 'Delivered',
    color: 'success',
  },

  cancelled: {
    label: 'Cancelled',
    color: 'destructive',
  },

  refunded: {
    label: 'Refunded',
    color: 'default',
  },

  return_requested: {
    label: 'Return Requested',
    color: 'warning',
  },

  return_initiated: {
    label: 'Return Initiated',
    color: 'info',
  },

  returned: {
    label: 'Returned',
    color: 'default',
  },

  exchange_initiated: {
    label: 'Exchange Initiated',
    color: 'info',
  },

  exchanged: {
    label: 'Exchanged',
    color: 'default',
  },
}

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/dashboard/orders')

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(
        id,
        status,
        return_status,
        cancel_custom_reason,
        cancel_reason:cancel_reasons(label),
        cancelled_at,
        product_name,
        product_image,
        quantity,
        total_price,
        variant_size,
        variant_color
      ),
      shipping_method:shipping_methods(name, estimated_days_min, estimated_days_max)
      ,
      delhivery_shipment:delhivery_shipments(
        id,
        awb,
        status,
        instructions,
        expected_delivery_date,
        last_synced_at,
        events:delhivery_tracking_events(
          id,
          status,
          location,
          instructions,
          occurred_at
        )
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>
          <p className="text-gray-500 mt-1">{orders?.length || 0} orders total</p>
        </div>

        {!orders || orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <Package className="h-16 w-16 text-gray-200 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h2>
            <p className="text-gray-500 mb-6">Start shopping to see your orders here</p>
            <Link href="/products" className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-purple-700 transition-colors">
              Shop Now
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const statusConfig = STATUS_CONFIG[order.status as OrderStatus] || STATUS_CONFIG.pending
              const shipment = Array.isArray(order.delhivery_shipment)
                ? order.delhivery_shipment[0]
                : order.delhivery_shipment
              const trackingEvents = [...(shipment?.events || [])]
                .sort(
                  (a, b) =>
                    new Date(b.occurred_at || 0).getTime() -
                    new Date(a.occurred_at || 0).getTime()
                )
                .slice(0, 4)
              return (
                <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                      <div>
                        <p className="text-xs text-gray-500">Order Number</p>
                        <p className="font-bold text-gray-900">{order.order_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Order Date</p>
                        <p className="text-sm font-medium">{formatDate(order.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Order Total</p>
                        <p className="text-sm font-bold">{formatPrice(order.total)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                      <Badge variant={statusConfig.color}>{statusConfig.label}</Badge>
                      <a
                        href={`/api/invoices/${order.id}`}
                        download={`invoice-${order.order_number}.pdf`}
                        className="flex items-center gap-1 text-sm text-gray-600 hover:text-purple-600 transition-colors"
                      >
                        <FileDown className="h-4 w-4" /> Invoice
                      </a>
                    </div>
                  </div>
                  {/* Items */}
                  <div className="p-4">
                    {order.items?.map((item: {
                      id: string
                      product_name: string
                      product_image?: string
                      quantity: number
                      variant_size?: string
                      variant_color?: string
                      total_price: number
                      status?: string
                      return_status?: string
                      cancel_custom_reason?: string | null
                      cancel_reason?: { label?: string } | null
                    }) => {
                      const isItemCancelled =
                        item.status === 'cancelled' ||
                        item.status === 'cancel_requested'
                      const cancelReasonLabel =
                        item.cancel_reason?.label || item.cancel_custom_reason

                      return (
                        <div 
                          key={item.id} 
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-gray-100 last:border-0"
                        >
                          {/* LEFT SIDE - Takes 100% width on mobile */}
                          <Link 
                            className="flex items-center gap-3 min-w-0 w-full sm:flex-1" 
                            href={`/products/${item.product_name.toLowerCase().replace(/\s+/g, '-')}/?size=${item.variant_size || ''}${item.variant_color ? `&color=${item.variant_color}` : ''}`}
                          >
                            {/* IMAGE */}
                            <div className="relative h-12 w-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                              {item.product_image ? (
                                <OptimizedImage
                                  src={item.product_image}
                                  alt={item.product_name}
                                  fill
                                  variant="order"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="h-full w-full bg-gray-200" />
                              )}
                            </div>

                            {/* DETAILS */}
                            <div className="text-sm min-w-0 flex-1">
                              <p className="text-gray-800 font-medium line-clamp-1">
                                {item.product_name}
                              </p>

                              <p className="text-gray-500 text-xs">
                                {item.variant_size && `${item.variant_size}`}
                                {item.variant_color && ` / ${item.variant_color}`}
                                {' ×'}{item.quantity}
                              </p>

                              {isItemCancelled && cancelReasonLabel && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                  Reason: {cancelReasonLabel}
                                </p>
                              )}
                            </div>
                          </Link>

                          {/* BOTTOM ROW (Mobile) / RIGHT SIDE (Desktop) */}
                          <div className="flex items-center justify-between w-full sm:w-auto sm:justify-end gap-4 pt-2 sm:pt-0 border-t border-dashed border-gray-100 sm:border-0">
                            {/* PRICE */}
                            <span className="text-sm font-medium text-gray-900 flex-shrink-0">
                              {formatPrice(item.total_price)}
                            </span>

                            {/* ACTIONS & BADGES */}
                            <div className="flex gap-2 flex-shrink-0 items-center">
                              <OrderItemStatusBadge
                                status={item.status}
                                returnStatus={item.return_status}
                              />

                              {/* CANCEL */}
                              {['pending', 'paid', 'processing', 'shipped'].includes(order.status) &&
                                !isItemCancelled &&
                                !item.return_status && (
                                  <OrderItemActions item={item} />
                                )}

                              {/* RETURN / EXCHANGE */}
                              {[
                                'delivered',
                                'return_requested',
                                'return_initiated',
                                'exchange_initiated',
                                'returned',
                              ].includes(order.status) &&
                                !isItemCancelled &&
                                !item.return_status && (
                                  <ReturnItemActions item={item} />
                                )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>


                  {/* Tracking */}
                  {order.tracking_number && (
                    <div className="mx-4 mb-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                            Delhivery tracking
                          </p>
                          <p className="mt-1 font-medium text-gray-900">
                            {shipment?.status || order.status}
                          </p>
                          <p className="text-xs text-gray-500">
                            AWB <span className="font-mono">{order.tracking_number}</span>
                          </p>
                        </div>
                        {shipment?.expected_delivery_date && (
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Expected delivery</p>
                            <p className="text-sm font-medium">
                              {formatDate(shipment.expected_delivery_date)}
                            </p>
                          </div>
                        )}
                      </div>

                      {trackingEvents.length > 0 && (
                        <div className="mt-4 space-y-3 border-l-2 border-purple-200 pl-4">
                          {trackingEvents.map((event) => (
                            <div key={event.id}>
                              <p className="text-sm font-medium text-gray-800">
                                {event.status}
                              </p>
                              <p className="text-xs text-gray-500">
                                {[event.location, event.occurred_at ? formatDate(event.occurred_at) : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Shipping method */}
                  {order.shipping_method && (
                    <div className="px-4 pb-4 text-xs text-gray-500">
                      {order.shipping_method.name} · Est. {order.shipping_method.estimated_days_min}–{order.shipping_method.estimated_days_max} business days
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
