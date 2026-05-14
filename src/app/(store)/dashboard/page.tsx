import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Package, Heart, MapPin, User, FileText, Landmark  } from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { OrderStatus } from '@/types'

// const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; color: 'success' | 'warning' | 'info' | 'default' | 'destructive' }> = {
//   pending: { label: 'Pending', color: 'warning' },
//   paid: { label: 'Paid', color: 'info' },
//   processing: { label: 'Processing', color: 'info' },
//   shipped: { label: 'Shipped', color: 'info' },
//   delivered: { label: 'Delivered', color: 'success' },
//   cancelled: { label: 'Cancelled', color: 'destructive' },
//   refunded: { label: 'Refunded', color: 'default' },
// }
const ORDER_STATUS_CONFIG: Record<
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

async function getDashboardData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const [ordersRes, wishlistRes, profileRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*, items:order_items(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('wishlist').select('product_id').eq('user_id', user.id),
    supabase.from('users').select('*').eq('id', user.id).single(),
  ])

  return {
    orders: ordersRes.data || [],
    wishlistCount: wishlistRes.data?.length || 0,
    profile: profileRes.data,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  if (!data) {
    redirect('/login?redirectTo=/dashboard')
  }

  const { orders, wishlistCount, profile } = data

  const QUICK_LINKS = [
    { href: '/dashboard/orders', icon: Package, label: 'My Orders', count: orders.length },
    { href: '/wishlist', icon: Heart, label: 'Wishlist', count: wishlistCount },
    { href: '/dashboard/addresses', icon: MapPin, label: 'Addresses' },
    { href: '/dashboard/profile', icon: User, label: 'Profile' },
    { href: '/dashboard/invoices', icon: FileText, label: 'Invoices' },
    { href: '/dashboard/bank-accounts', icon: Landmark, label: 'My Bank Accounts' },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Account</h1>
        <p className="text-gray-500 mt-1">Welcome back, {profile?.full_name || profile?.email}!</p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        {QUICK_LINKS.map(({ href, icon: Icon, label, count }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-3 p-6 bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all group"
          >
            <div className="relative">
              <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <Icon className="h-6 w-6 text-purple-600" />
              </div>
              {count !== undefined && count > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {count}
                </span>
              )}
            </div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-purple-600 transition-colors">
              {label}
            </span>
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
          <Link href="/dashboard/orders" className="text-sm text-purple-600 hover:underline">
            View All
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-12 w-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500">No orders yet</p>
            <Link href="/products" className="text-purple-600 hover:underline text-sm mt-2 block">
              Start shopping →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {orders.map((order) => {
              const statusConfig = ORDER_STATUS_CONFIG[order.status as OrderStatus] || ORDER_STATUS_CONFIG.pending
              return (
                <Link
                  key={order.id}
                  href={`/dashboard/orders/${order.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                      <Package className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{order.order_number}</p>
                      <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={statusConfig.color}>{statusConfig.label}</Badge>
                    <p className="font-bold text-gray-900">{formatPrice(order.total)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
