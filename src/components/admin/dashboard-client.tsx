'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { AlertTriangle, Loader2, TrendingDown, TrendingUp } from 'lucide-react'

type DashboardData = {
  label: string
  preset: string
  range: { from: string; to: string }
  kpis: {
    netRevenue: number
    orders: number
    aov: number
    itemsSold: number
    newCustomers: number
    repeatCustomers: number
    conversionRate: number | null
    contribution: number | null
    delivered: number
    cancelled: number
    rto: number
    prevNetRevenue: number
    revenueDelta: number
  }
  orderedVsRealised: {
    grossOrdered: number
    cancelled: number
    returnedRto: number
    discounts: number
    netRealised: number
  }
  orderFunnel: {
    placed: number
    confirmed: number
    packed: number
    shipped: number
    outForDelivery: number
    delivered: number
    cancelled: number
    rto: number
    returned: number
    refunded: number
    cancellationRate: number
    rtoRate: number
    deliveryRate: number
  }
  paymentSplit: {
    cod: {
      orders: number
      revenue: number
      delivered: number
      rto: number
      rtoRate: number
      confirmationRate: number
    }
    prepaid: {
      orders: number
      revenue: number
      delivered: number
      rto: number
      rtoRate: number
      confirmationRate: number
    }
    codOrderPct: number
    prepaidOrderPct: number
  }
  websiteFunnel: {
    sessions: number
    productViews: number
    addToCart: number
    checkoutStarted: number
    purchases: number
    productViewRate: number | null
    addToCartRate: number | null
    checkoutRate: number | null
    purchaseRate: number | null
    note?: string
  }
  series: Array<{
    date: string
    revenue: number
    orders: number
    aov: number
    units_sold: number
    profit: number
  }>
  comparison: {
    currentRevenue: number
    previousRevenue: number
    delta: number
  }
  attribution: Array<{
    channel: string
    orders: number
    revenue: number
    spend: number | null
    roas: number | null
    cpa: number | null
  }>
  topProducts: Array<{
    name: string
    units: number
    orders: number
    revenue: number
    returns: number
    conversion: number | null
  }>
  productInsights: {
    bestSize: string | null
    bestColor: string | null
    highestReturned: { name: string; returns: number } | null
  }
  customers: {
    newCustomers: number
    repeatCustomers: number
    repeatPurchaseRate: number
    avgCustomerSpend: number
    ordersPerCustomer: number
    topCities: Array<{ city: string; orders: number; revenue: number }>
    topPins: Array<{ pin: string; orders: number; revenue: number }>
  }
  alerts: {
    codAwaitingConfirmation: number
    delayedShipments: number
    rtoShipments: number
    readyToShip: number
    lowStockCount: number
  }
  lowStock: Array<{
    id: string
    stock: number
    size: string
    color: string
    product?: { name?: string } | null
  }>
}

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
] as const

type ChartMetric = 'revenue' | 'orders' | 'aov' | 'units_sold' | 'profit'

function pct(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function Card({
  title,
  children,
  className = '',
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-5 ${className}`}>
      {title ? (
        <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
      ) : null}
      {children}
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {hint ? <p className="text-xs text-gray-500 mt-1">{hint}</p> : null}
    </div>
  )
}

export function DashboardClient() {
  const [preset, setPreset] = useState('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<ChartMetric>('revenue')
  const [spendForm, setSpendForm] = useState({
    channel: 'meta',
    amount: '',
    spend_date: new Date().toISOString().slice(0, 10),
    campaign_name: '',
  })
  const [savingSpend, setSavingSpend] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ preset })
      if (preset === 'custom' && customFrom && customTo) {
        params.set('from', customFrom)
        params.set('to', customTo)
      }
      const res = await fetch(`/api/admin/dashboard?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [preset, customFrom, customTo])

  useEffect(() => {
    if (preset === 'custom' && (!customFrom || !customTo)) return
    void load()
  }, [load, preset, customFrom, customTo])

  const chartData = useMemo(() => {
    if (!data?.series) return []
    return data.series.map((row) => ({
      ...row,
      label: new Date(row.date).toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
      }),
    }))
  }, [data])

  const addSpend = async () => {
    const amount = Number(spendForm.amount)
    if (!amount || amount < 0) {
      toast.error('Enter a valid spend amount')
      return
    }
    setSavingSpend(true)
    try {
      const res = await fetch('/api/admin/marketing-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: spendForm.channel,
          amount,
          spend_date: spendForm.spend_date,
          campaign_name: spendForm.campaign_name || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Spend saved')
      setSpendForm((s) => ({ ...s, amount: '', campaign_name: '' }))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save spend')
    } finally {
      setSavingSpend(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            LFOUR37 operations overview
            {data?.range ? ` · ${data.range.from} → ${data.range.to}` : ''}
          </p>
        </div>

        <Card className="lg:min-w-[280px] !p-4">
          <p className="text-sm font-semibold text-gray-900 mb-2">Needs Attention</p>
          {data ? (
            <ul className="space-y-1.5 text-sm">
              <li className="text-red-700">
                {data.alerts.codAwaitingConfirmation} COD awaiting confirmation
              </li>
              <li className="text-orange-700">
                {data.alerts.delayedShipments} shipments delayed &gt; 3 days
              </li>
              <li className="text-orange-700">
                {data.alerts.rtoShipments} RTO shipments
              </li>
              <li className="text-green-700">
                {data.alerts.readyToShip} orders ready to ship
              </li>
              <li className="text-orange-700">
                {data.alerts.lowStockCount} low-stock variants
              </li>
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Loading…</p>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              preset === p.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-auto"
            />
            <span className="text-gray-400">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-auto"
            />
          </div>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {!data ? (
        <div className="h-64 flex items-center justify-center text-gray-400">
          {loading ? 'Loading dashboard…' : 'No data'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Kpi label="Net Revenue" value={formatPrice(data.kpis.netRevenue)} />
            <Kpi label="Orders" value={String(data.kpis.orders)} />
            <Kpi label="AOV" value={formatPrice(data.kpis.aov)} />
            <Kpi label="Items Sold" value={String(data.kpis.itemsSold)} />
            <Kpi label="Delivered" value={String(data.kpis.delivered)} />
            <Kpi label="RTO" value={String(data.kpis.rto)} />
            <Kpi label="Cancelled" value={String(data.kpis.cancelled)} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="New Customers"
              value={String(data.kpis.newCustomers)}
            />
            <Kpi
              label="Repeat Customers"
              value={String(data.kpis.repeatCustomers)}
            />
            <Kpi
              label="Conversion Rate"
              value={pct(data.kpis.conversionRate)}
              hint="Purchases ÷ sessions"
            />
            <Kpi
              label="Contribution"
              value={
                data.kpis.contribution == null
                  ? 'N/A'
                  : formatPrice(data.kpis.contribution)
              }
              hint="Revenue − COGS − shipping − ads"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Ordered vs Realised Revenue" className="lg:col-span-1">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Gross ordered</dt>
                  <dd className="font-medium">
                    {formatPrice(data.orderedVsRealised.grossOrdered)}
                  </dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>Cancelled</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.cancelled)}</dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>Returned / RTO</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.returnedRto)}</dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>Discounts</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.discounts)}</dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold text-gray-900">
                  <dt>Net realised</dt>
                  <dd>{formatPrice(data.orderedVsRealised.netRealised)}</dd>
                </div>
              </dl>
            </Card>

            <Card title="Trend" className="lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['revenue', 'Revenue'],
                      ['orders', 'Orders'],
                      ['aov', 'AOV'],
                      ['units_sold', 'Units'],
                      ['profit', 'Profit'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMetric(id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                        metric === id
                          ? 'bg-[#c39c41]/15 border-[#c39c41] text-gray-900'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">
                    {formatPrice(data.comparison.currentRevenue)}
                  </span>
                  <span className="mx-1">vs prev</span>
                  <span>{formatPrice(data.comparison.previousRevenue)}</span>
                  <span
                    className={`ml-2 inline-flex items-center gap-1 ${
                      data.comparison.delta >= 0
                        ? 'text-green-700'
                        : 'text-red-700'
                    }`}
                  >
                    {data.comparison.delta >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {data.comparison.delta >= 0 ? '+' : ''}
                    {formatPrice(data.comparison.delta)}
                  </span>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="dashMetric" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c39c41" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#c39c41" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid #e5e7eb',
                      }}
                      formatter={((value: number | string) => {
                        const n = Number(value || 0)
                        if (metric === 'orders' || metric === 'units_sold') {
                          return [n, metric]
                        }
                        return [formatPrice(n), metric]
                      }) as never}
                    />
                    <Area
                      type="monotone"
                      dataKey={metric}
                      stroke="#c39c41"
                      strokeWidth={2}
                      fill="url(#dashMetric)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Order Status Funnel">
              <p className="text-sm text-gray-700 mb-3">
                <span className="font-semibold">{data.orderFunnel.placed}</span> Orders
                placed →{' '}
                <span className="font-semibold">{data.orderFunnel.confirmed}</span>{' '}
                confirmed →{' '}
                <span className="font-semibold">{data.orderFunnel.packed}</span> packed
                → <span className="font-semibold">{data.orderFunnel.shipped}</span>{' '}
                shipped →{' '}
                <span className="font-semibold">
                  {data.orderFunnel.outForDelivery}
                </span>{' '}
                OFD →{' '}
                <span className="font-semibold">{data.orderFunnel.delivered}</span>{' '}
                delivered
              </p>
              <p className="text-sm text-gray-600 mb-3">
                {data.orderFunnel.cancelled} Cancelled | {data.orderFunnel.rto} RTO |{' '}
                {data.orderFunnel.returned} Returned | {data.orderFunnel.refunded}{' '}
                Refunded
              </p>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Cancel rate</p>
                  <p className="font-semibold">
                    {pct(data.orderFunnel.cancellationRate)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">RTO rate</p>
                  <p className="font-semibold">{pct(data.orderFunnel.rtoRate)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Delivery rate</p>
                  <p className="font-semibold">
                    {pct(data.orderFunnel.deliveryRate)}
                  </p>
                </div>
              </div>
            </Card>

            <Card title="COD vs Prepaid">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2">Type</th>
                      <th>Orders</th>
                      <th>Revenue</th>
                      <th>Delivered</th>
                      <th>RTO</th>
                      <th>RTO %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['COD', data.paymentSplit.cod],
                        ['Prepaid', data.paymentSplit.prepaid],
                      ] as const
                    ).map(([label, row]) => (
                      <tr key={label} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{label}</td>
                        <td>{row.orders}</td>
                        <td>{formatPrice(row.revenue)}</td>
                        <td>{row.delivered}</td>
                        <td>{row.rto}</td>
                        <td>{pct(row.rtoRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <p>
                  COD % of orders:{' '}
                  <span className="font-semibold">
                    {pct(data.paymentSplit.codOrderPct)}
                  </span>
                </p>
                <p>
                  Prepaid %:{' '}
                  <span className="font-semibold">
                    {pct(data.paymentSplit.prepaidOrderPct)}
                  </span>
                </p>
                <p>
                  COD confirmation:{' '}
                  <span className="font-semibold">
                    {pct(data.paymentSplit.cod.confirmationRate)}
                  </span>
                </p>
                <p>
                  COD RTO rate:{' '}
                  <span className="font-semibold">
                    {pct(data.paymentSplit.cod.rtoRate)}
                  </span>
                </p>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Website Conversion Funnel">
              <p className="text-xs text-amber-700 mb-2">{data.websiteFunnel.note}</p>
              <p className="text-sm text-gray-700 mb-3">
                {data.websiteFunnel.sessions} Visitors →{' '}
                {data.websiteFunnel.productViews} Product views →{' '}
                {data.websiteFunnel.addToCart} ATC →{' '}
                {data.websiteFunnel.checkoutStarted} Checkout →{' '}
                {data.websiteFunnel.purchases} Purchases
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>Product view rate: {pct(data.websiteFunnel.productViewRate)}</p>
                <p>Add-to-cart rate: {pct(data.websiteFunnel.addToCartRate)}</p>
                <p>Checkout rate: {pct(data.websiteFunnel.checkoutRate)}</p>
                <p>Purchase rate: {pct(data.websiteFunnel.purchaseRate)}</p>
              </div>
            </Card>

            <Card title="New vs Returning Customers">
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">New</p>
                  <p className="text-xl font-bold">{data.customers.newCustomers}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Returning</p>
                  <p className="text-xl font-bold">
                    {data.customers.repeatCustomers}
                  </p>
                </div>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt>Repeat purchase rate</dt>
                  <dd>{pct(data.customers.repeatPurchaseRate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Avg customer spend</dt>
                  <dd>{formatPrice(data.customers.avgCustomerSpend)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Orders per customer</dt>
                  <dd>{data.customers.ordersPerCustomer.toFixed(2)}</dd>
                </div>
              </dl>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Top Products">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2">Product</th>
                      <th>Units</th>
                      <th>Orders</th>
                      <th>Revenue</th>
                      <th>Returns</th>
                      <th>Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-gray-400">
                          No product sales in range
                        </td>
                      </tr>
                    ) : (
                      data.topProducts.map((p) => (
                        <tr key={p.name} className="border-b border-gray-50">
                          <td className="py-2 max-w-[160px] truncate">{p.name}</td>
                          <td>{p.units}</td>
                          <td>{p.orders}</td>
                          <td>{formatPrice(p.revenue)}</td>
                          <td>{p.returns}</td>
                          <td>{pct(p.conversion)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Best size: {data.productInsights.bestSize || '—'} · Best colour:{' '}
                {data.productInsights.bestColor || '—'}
                {data.productInsights.highestReturned
                  ? ` · Highest returns: ${data.productInsights.highestReturned.name} (${data.productInsights.highestReturned.returns})`
                  : ''}
              </p>
            </Card>

            <Card title="Top Cities & PIN Codes">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Cities</p>
                  <ul className="space-y-1">
                    {data.customers.topCities.map((c) => (
                      <li key={c.city} className="flex justify-between gap-2">
                        <span className="truncate">{c.city}</span>
                        <span className="text-gray-500 shrink-0">
                          {c.orders} · {formatPrice(c.revenue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">PIN codes</p>
                  <ul className="space-y-1">
                    {data.customers.topPins.map((p) => (
                      <li key={p.pin} className="flex justify-between gap-2">
                        <span>{p.pin}</span>
                        <span className="text-gray-500 shrink-0">
                          {p.orders} · {formatPrice(p.revenue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </div>

          <Card title="Marketing Attribution">
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2">Channel</th>
                    <th>Orders</th>
                    <th>Revenue</th>
                    <th>Spend</th>
                    <th>ROAS</th>
                    <th>CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attribution.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-gray-400">
                        No attributed orders yet (UTM captured on new checkouts)
                      </td>
                    </tr>
                  ) : (
                    data.attribution.map((row) => (
                      <tr key={row.channel} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{row.channel}</td>
                        <td>{row.orders}</td>
                        <td>{formatPrice(row.revenue)}</td>
                        <td>
                          {row.spend == null ? '—' : formatPrice(row.spend)}
                        </td>
                        <td>
                          {row.roas == null ? '—' : row.roas.toFixed(2)}
                        </td>
                        <td>
                          {row.cpa == null ? '—' : formatPrice(row.cpa)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-dashed border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-800 mb-2">
                Add marketing spend
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="text-xs text-gray-500">Channel</label>
                  <select
                    className="block border rounded-lg px-2 py-1.5 text-sm"
                    value={spendForm.channel}
                    onChange={(e) =>
                      setSpendForm((s) => ({ ...s, channel: e.target.value }))
                    }
                  >
                    <option value="meta">Meta</option>
                    <option value="google">Google</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Amount (₹)</label>
                  <Input
                    value={spendForm.amount}
                    onChange={(e) =>
                      setSpendForm((s) => ({ ...s, amount: e.target.value }))
                    }
                    className="w-28"
                    type="number"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Date</label>
                  <Input
                    type="date"
                    value={spendForm.spend_date}
                    onChange={(e) =>
                      setSpendForm((s) => ({
                        ...s,
                        spend_date: e.target.value,
                      }))
                    }
                    className="w-auto"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Campaign</label>
                  <Input
                    value={spendForm.campaign_name}
                    onChange={(e) =>
                      setSpendForm((s) => ({
                        ...s,
                        campaign_name: e.target.value,
                      }))
                    }
                    className="w-40"
                    placeholder="Optional"
                  />
                </div>
                <Button
                  type="button"
                  onClick={addSpend}
                  loading={savingSpend}
                  size="sm"
                >
                  Save spend
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Cancelled / Returned / RTO">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs text-red-700">Cancelled</p>
                  <p className="text-2xl font-bold text-red-800">
                    {data.orderFunnel.cancelled}
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    {pct(data.orderFunnel.cancellationRate)} of placed
                  </p>
                </div>
                <div className="rounded-lg bg-orange-50 p-3">
                  <p className="text-xs text-orange-700">RTO</p>
                  <p className="text-2xl font-bold text-orange-800">
                    {data.orderFunnel.rto}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    {pct(data.orderFunnel.rtoRate)} of shipped
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs text-amber-800">Returned</p>
                  <p className="text-2xl font-bold text-amber-900">
                    {data.orderFunnel.returned}
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Low Stock">
              {data.lowStock.length === 0 ? (
                <p className="text-sm text-gray-400">All variants well stocked</p>
              ) : (
                <div className="space-y-2">
                  {data.lowStock.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-orange-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                          {(variant.product as { name?: string } | null)?.name ||
                            'Product'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {variant.size} / {variant.color}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-bold ${
                          variant.stock === 0 ? 'text-red-600' : 'text-orange-600'
                        }`}
                      >
                        {variant.stock === 0
                          ? 'Out of stock'
                          : `${variant.stock} left`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
