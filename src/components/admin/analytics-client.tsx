'use client'

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { formatPrice } from '@/lib/utils'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  revenueChartData: { date: string; revenue: number; orders: number }[]
  topProducts: { id: string; name: string; revenue: number; units: number }[]
  paymentMethods: Record<string, number>
  statusCounts: Record<string, number>
  userChartData: { date: string; users: number }[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  paid: '#3b82f6',
  processing: '#c39c41',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
  refunded: '#6b7280',
}

const PAYMENT_COLORS = ['#c39c41', '#3b82f6']

export function AnalyticsClient({ revenueChartData, topProducts, paymentMethods, statusCounts, userChartData }: Props) {
  const totalRevenue = revenueChartData.reduce((s, d) => s + d.revenue, 0)
  const totalOrders = revenueChartData.reduce((s, d) => s + d.orders, 0)
  const totalUsers = userChartData.reduce((s, d) => s + d.users, 0)
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  const paymentPieData = Object.entries(paymentMethods).map(([method, amount]) => ({
    name: method.charAt(0).toUpperCase() + method.slice(1),
    value: amount,
  }))

  const statusPieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: count,
    color: STATUS_COLORS[status] || '#6b7280',
  }))

  const exportCSV = () => {
    const rows = [
      ['Date', 'Revenue', 'Orders'],
      ...revenueChartData.map((d) => [d.date, d.revenue.toFixed(2), d.orders]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'analytics-export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatShortDate = (date: string) => {
    const d = new Date(date)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: formatPrice(totalRevenue), sub: 'Last 30 days' },
          { label: 'Total Orders', value: totalOrders, sub: 'Last 30 days' },
          { label: 'New Users', value: totalUsers, sub: 'Last 30 days' },
          { label: 'Avg. Order Value', value: formatPrice(avgOrderValue), sub: 'Per order' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Revenue & Orders (30 days)</h2>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={revenueChartData}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c39c41" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#c39c41" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: number, name: string) =>
                name === 'revenue' ? [formatPrice(value ?? 0), 'Revenue'] : [value ?? 0, 'Orders']
              ) as any}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#c39c41" fill="url(#revGrad)" strokeWidth={2} />
            <Bar yAxisId="right" dataKey="orders" fill="#c39c4195" radius={[2, 2, 0, 0]} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Payment methods */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Payment Methods</h2>
          {paymentPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={paymentPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {paymentPieData.map((_, i) => (
                    <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={((v: number) => formatPrice(v)) as any} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-8">No payment data</p>
          )}
        </div>

        {/* Orders by status */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Orders by Status</h2>
          {statusPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-8">No order data</p>
          )}
        </div>
      </div>

      {/* New users chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">New Users (30 days)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={userChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip labelFormatter={(l) => `Date: ${l}`} />
            <Bar dataKey="users" fill="#c39c41" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top products */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Top Products by Revenue</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Units Sold</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {topProducts.map((p, i) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-6 py-3 text-right text-gray-600">{p.units}</td>
                <td className="px-6 py-3 text-right font-semibold text-gray-900">{formatPrice(p.revenue)}</td>
              </tr>
            ))}
            {topProducts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">No sales data yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
