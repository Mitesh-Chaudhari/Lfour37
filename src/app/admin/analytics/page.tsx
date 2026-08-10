import { createClient } from '@/lib/supabase/server'
import { AnalyticsClient } from '@/components/admin/analytics-client'
import {
  formatDateInBusinessTz,
  shiftBusinessDay,
  startOfBusinessDayIso,
} from '@/lib/timezone'

export default async function AdminAnalyticsPage() {
  const supabase = await createClient()

  const today = formatDateInBusinessTz(new Date())
  const from30 = shiftBusinessDay(today, -29)
  const thirtyDaysAgoIso = startOfBusinessDayIso(from30)

  const [
    { data: revenueData },
    { data: paymentBreakdown },
    { data: topProducts },
    { data: ordersByStatus },
    { data: newUsersData },
  ] = await Promise.all([
    // Daily revenue for last 30 days
    supabase
      .from('orders')
      .select('created_at, total, status')
      .gte('created_at', thirtyDaysAgoIso)
      .in('status', ['paid', 'processing', 'shipped', 'delivered'])
      .order('created_at'),

    // Payment method breakdown
    supabase
      .from('payments')
      .select('payment_method, amount, status')
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgoIso),

    // Top products by revenue
    supabase
      .from('order_items')
      .select('product_name, product_id, quantity, total_price')
      .gte('created_at', thirtyDaysAgoIso)
      .limit(100),

    // Orders by status
    supabase
      .from('orders')
      .select('status')
      .gte('created_at', thirtyDaysAgoIso),

    // New users per day
    supabase
      .from('users')
      .select('created_at')
      .gte('created_at', thirtyDaysAgoIso)
      .order('created_at'),
  ])

  // Aggregate daily revenue (IST calendar days)
  const dailyRevenue: Record<string, { revenue: number; orders: number }> = {}
  for (const order of revenueData || []) {
    const date = formatDateInBusinessTz(order.created_at)
    if (!dailyRevenue[date]) dailyRevenue[date] = { revenue: 0, orders: 0 }
    dailyRevenue[date].revenue += order.total
    dailyRevenue[date].orders += 1
  }

  // Fill missing days
  const revenueChartData = []
  for (let i = 29; i >= 0; i--) {
    const dateStr = shiftBusinessDay(today, -i)
    revenueChartData.push({
      date: dateStr,
      revenue: dailyRevenue[dateStr]?.revenue || 0,
      orders: dailyRevenue[dateStr]?.orders || 0,
    })
  }

  // Aggregate top products
  const productMap: Record<string, { name: string; revenue: number; units: number }> = {}
  for (const item of topProducts || []) {
    if (!productMap[item.product_id]) productMap[item.product_id] = { name: item.product_name, revenue: 0, units: 0 }
    productMap[item.product_id].revenue += item.total_price
    productMap[item.product_id].units += item.quantity
  }
  const topProductsList = Object.entries(productMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Payment method breakdown
  const paymentMethods: Record<string, number> = {}
  for (const p of paymentBreakdown || []) {
    paymentMethods[p.payment_method] = (paymentMethods[p.payment_method] || 0) + p.amount
  }

  // Orders by status counts
  const statusCounts: Record<string, number> = {}
  for (const o of ordersByStatus || []) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
  }

  // New users per day
  const usersByDay: Record<string, number> = {}
  for (const u of newUsersData || []) {
    const date = formatDateInBusinessTz(u.created_at)
    usersByDay[date] = (usersByDay[date] || 0) + 1
  }
  const userChartData = revenueChartData.map((d) => ({
    date: d.date,
    users: usersByDay[d.date] || 0,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Last 30 days overview</p>
      </div>
      <AnalyticsClient
        revenueChartData={revenueChartData}
        topProducts={topProductsList}
        paymentMethods={paymentMethods}
        statusCounts={statusCounts}
        userChartData={userChartData}
      />
    </div>
  )
}
