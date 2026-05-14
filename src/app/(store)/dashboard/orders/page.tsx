import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Package, FileDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import { OrderStatus } from '@/types'
import Image from 'next/image'
import OrderItemActions from '@/components/order/order-item-actions'
import ReturnItemActions from '@/components/order/return-item-action'

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
        cancel_reason,
        cancelled_at,
        product_name,
        product_image,
        quantity,
        total_price,
        variant_size,
        variant_color
      ),
      shipping_method:shipping_methods(name, estimated_days_min, estimated_days_max)
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
              return (
                <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-4">
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
                    <div className="flex items-center gap-3">
                      <Badge variant={statusConfig.color}>{statusConfig.label}</Badge>
                      <Link
                        href={`/api/invoices/${order.id}`}
                        className="flex items-center gap-1 text-sm text-gray-600 hover:text-purple-600 transition-colors"
                      >
                        <FileDown className="h-4 w-4" /> Invoice
                      </Link>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-4">
                    {order.items?.slice(0, 3).map((item: {
                      id: string
                      product_name: string
                      product_image?: string
                      quantity: number
                      variant_size?: string
                      variant_color?: string
                      total_price: number
                      status?: string
                      return_status?: string
                    }) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 py-2">

                        {/* LEFT SIDE */}
                        <Link className="flex items-center gap-3" href={`/products/${item.product_name.toLowerCase().replace(/\s+/g, '-')}/?size=${item.variant_size || ''}${item.variant_color ? `&color=${item.variant_color}` : ''}`}>
                          {/* IMAGE */}
                          <div className="relative h-12 w-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                            {item.product_image ? (
                              <Image
                                width={200}
                                height={200}
                                src={item.product_image}
                                alt={item.product_name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full bg-gray-200" />
                            )}
                          </div>

                          {/* DETAILS */}
                          <div className="text-sm">
                            <p className="text-gray-800 font-medium line-clamp-1">
                              {item.product_name}
                            </p>

                            <p className="text-gray-500 text-xs">
                              {item.variant_size && `${item.variant_size}`}
                              {item.variant_color && ` / ${item.variant_color}`}
                              {' ×'}{item.quantity}
                            </p>

                            {item.return_status && (
                              <p className="text-xs text-blue-600 mt-1">
                                Return Status: {item.return_status}
                              </p>
                            )}
                          </div>
                        </Link>

                        {/* PRICE */}
                        <span className="text-sm font-medium text-gray-900">
                          {formatPrice(item.total_price)}
                        </span>

                        <div className="flex gap-2">

                          {/* CANCEL */}
                          {['pending', 'paid', 'processing', 'shipped'].includes(order.status) &&
                            item.status !== 'cancelled' &&
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
                            item.status !== 'cancelled' && (
                              <>
                                {!item.return_status ? (
                                  <ReturnItemActions item={item} />
                                ) : (
                                  <span
                                    className={`text-xs px-2 py-1 rounded ${item.return_status === 'return_requested'
                                      ? 'bg-orange-100 text-orange-700'
                                      : item.return_status === 'return_approved'
                                        ? 'bg-green-100 text-green-700'
                                        : item.return_status === 'return_rejected'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}
                                  >
                                    {item.return_status
                                      .replace(/_/g, ' ')
                                      .replace(/\b\w/g, (c) =>
                                        c.toUpperCase()
                                      )}
                                  </span>
                                )}
                              </>
                            )}

                        </div>
                      </div>
                    ))}
                    {order.items && order.items.length > 3 && (
                      <p className="text-xs text-gray-400 mt-1">+{order.items.length - 3} more items</p>
                    )}
                  </div>

                  {/* Tracking */}
                  {order.tracking_number && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-gray-600">
                        Tracking: <span className="font-mono font-medium">{order.tracking_number}</span>
                      </p>
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
