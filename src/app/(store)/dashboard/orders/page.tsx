import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Package, FileDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import { OrderStatus } from '@/types'

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: 'success' | 'warning' | 'info' | 'default' | 'destructive' }> = {
  pending: { label: 'Pending', color: 'warning' },
  paid: { label: 'Paid', color: 'info' },
  processing: { label: 'Processing', color: 'info' },
  shipped: { label: 'Shipped', color: 'info' },
  delivered: { label: 'Delivered', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'destructive' },
  refunded: { label: 'Refunded', color: 'default' },
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
        id, product_name, quantity, total_price, variant_size, variant_color
      ),
      shipping_method:shipping_methods(name, estimated_days_min, estimated_days_max)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
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
                      <p className="text-xs text-gray-500">Date</p>
                      <p className="text-sm font-medium">{formatDate(order.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total</p>
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
                  {order.items?.slice(0, 3).map((item: { id: string; product_name: string; quantity: number; variant_size?: string; variant_color?: string; total_price: number }) => (
                    <div key={item.id} className="flex justify-between text-sm py-1">
                      <span className="text-gray-700">
                        {item.product_name}
                        {item.variant_size && ` (${item.variant_size}/${item.variant_color})`}
                        {' ×'}{item.quantity}
                      </span>
                      <span className="font-medium">{formatPrice(item.total_price)}</span>
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
  )
}
