import { createClient } from '@/lib/supabase/server'
import { TrendingUp, ShoppingBag, Users, DollarSign, AlertTriangle } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { RevenueChart } from '@/components/admin/revenue-chart'

async function getDashboardStats() {
  const supabase = await createClient()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const [
    ordersRes,
    usersRes,
    recentOrdersRes,
    recentUsersRes,
    revenueRes,
    prevRevenueRes,
    lowStockRes,
    revenueChartRes,
    topProductsRes,
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabase.from('orders').select('total').gte('created_at', thirtyDaysAgo).eq('payment_status', 'completed'),
    supabase.from('orders').select('total').gte('created_at', sixtyDaysAgo).lt('created_at', thirtyDaysAgo).eq('payment_status', 'completed'),
    supabase.from('product_variants').select('id, product_id, stock, size, color, product:products(name)').lt('stock', 5).eq('is_active', true).order('stock').limit(10),
    supabase.rpc('get_revenue_by_day', { days: 30 }).select('*').limit(30),
    supabase.from('products').select('id, name, total_sold, price').eq('status', 'active').order('total_sold', { ascending: false }).limit(5),
  ])

  const revenue = revenueRes.data?.reduce((sum, o) => sum + Number(o.total), 0) || 0
  const prevRevenue = prevRevenueRes.data?.reduce((sum, o) => sum + Number(o.total), 0) || 0

  const orders = ordersRes.count || 0
  const users = usersRes.count || 0
  const recentOrders = recentOrdersRes.count || 0
  const recentUsers = recentUsersRes.count || 0

  const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0

  return {
    revenue,
    orders,
    users,
    recentOrders,
    recentUsers,
    revenueChange,
    lowStock: lowStockRes.data || [],
    topProducts: topProductsRes.data || [],
    revenueChart: revenueChartRes.data || [],
  }
}

function StatCard({
  title,
  value,
  change,
  footer,
  icon: Icon,
  prefix = '',
}: {
  title: string
  value: string | number
  change?: number
  footer?: string
  icon: React.ElementType
  prefix?: string
}) {
  const isPositive = (change ?? 0) >= 0
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
          <Icon className="h-5 w-5 text-purple-600" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">
        {prefix}{value}
      </p>
      {footer ? (
        <p className="mt-2 text-sm text-gray-500">{footer}</p>
      ) : change !== undefined ? (
        <div className={`flex items-center gap-1 mt-2 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          <TrendingUp className={`h-4 w-4 ${!isPositive && 'rotate-180'}`} />
          <span>{Math.abs(change).toFixed(1)}% vs previous 30 days</span>
        </div>
      ) : null}
    </div>
  )
}

export default async function AdminDashboard() {
  const stats = await getDashboardStats()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Store overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard title="Revenue (30 days)" value={formatPrice(stats.revenue)} change={stats.revenueChange} icon={DollarSign} />
        <StatCard
          title="Total Orders"
          value={stats.orders}
          footer={`${stats.recentOrders} in last 30 days`}
          icon={ShoppingBag}
        />
        <StatCard
          title="Total Users"
          value={stats.users}
          footer={`${stats.recentUsers} joined in last 30 days`}
          icon={Users}
        />
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Revenue Over Time</h2>
        <RevenueChart data={stats.revenueChart} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Products</h2>
          {stats.topProducts.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet</p>
          ) : (
            <div className="space-y-3">
              {stats.topProducts.map((product: { id: string; name: string; total_sold: number; price: number }, i) => (
                <div key={product.id} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-300 w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.total_sold} sold</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{formatPrice(product.price * product.total_sold)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Low Stock Alerts
          </h2>
          {stats.lowStock.length === 0 ? (
            <p className="text-gray-400 text-sm">All products well stocked!</p>
          ) : (
            <div className="space-y-2">
              {stats.lowStock.map((variant: any) => (
                <div key={variant.id} className="flex items-center justify-between p-2 rounded-lg bg-orange-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{variant.product?.name}</p>
                    <p className="text-xs text-gray-500">{variant.size} / {variant.color}</p>
                  </div>
                  <span className={`text-sm font-bold ${variant.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {variant.stock === 0 ? 'Out of stock' : `${variant.stock} left`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
