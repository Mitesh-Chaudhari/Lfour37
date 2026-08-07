'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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

type PaymentMethodStats = {
  orders: number
  revenue: number
  delivered: number
  rto: number
  rtoRate: number
  confirmationRate: number
  pendingConfirmation: number
  cancelledBeforeShippingPct: number
  deliveredPct: number
  valueAtRisk: number
  inTransit: number
  cancelled: number
}

type DashboardData = {
  label: string
  preset: string
  range: { from: string; to: string }
  scopeHint: string
  kpis: {
    ordersPlaced: number
    ordersConfirmed: number
    ordersPending: number
    ordersCancelled: number
    orderedRevenue: number
    shippedRevenue: number
    realisedRevenue: number
    aov: number
    itemsSold: number
    newCustomers: number
    repeatCustomers: number
    websitePurchaseConversion: number | null
    contribution: number | null
    contributionMarginPct: number | null
    delivered: number
    cancelled: number
    rto: number
    revenueDelta: number
    prevOrderedRevenue: number
    netRevenue: number
    orders: number
  }
  revenueTiers: {
    ordered: number
    shipped: number
    realised: number
  }
  orderedVsRealised: {
    grossProductValue: number
    discounts: number
    cancelled: number
    returned: number
    refunded: number
    rtoExtra: number
    netOrderRevenue: number
    discountsNote?: string
    realisedRevenue: number
    shippedRevenue: number
    orderedRevenue: number
  }
  contributionBreakdown: {
    orderedRevenue: number
    cogs: number
    shipping: number
    adsSpend: number
    contribution: number | null
    contributionMarginPct: number | null
    hasCostData: boolean
  }
  orderFunnel: {
    placed: number
    confirmed: number
    packed: number
    shipped: number
    outForDelivery: number
    delivered: number
    cancelled: number
    pending: number
    rto: number
    returned: number
    refunded: number
    cancellationRate: number
    rtoRate: number
    deliveryRate: number
  }
  paymentSplit: {
    cod: PaymentMethodStats
    prepaid: PaymentMethodStats
    codOrderPct: number
    prepaidOrderPct: number
  }
  websiteFunnel: {
    sessions: number
    productViews: number
    sessionsWithProductView: number
    productViewerRate: number | null
    viewsPerVisitor: number | null
    addToCart: number
    checkoutStarted: number
    purchases: number
    ordersInRange: number
    addToCartRate: number | null
    checkoutRate: number | null
    purchaseRate: number | null
    websitePurchaseConversion?: number | null
    trackingIncomplete: boolean
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
    trackingUnavailable?: boolean
  }>
  sizeSales: Array<{ size: string; units: number; pct: number }>
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
    topStates: Array<{
      state: string
      orders: number
      revenue: number
      aov: number
      codPct: number
      rtoPct: number
    }>
  }
  shipmentAgeing: {
    packedOver24h: number
    shippedOver5d: number
    ofdNotDelivered: number
  }
  alerts: {
    codAwaitingConfirmation: number
    packedNotShipped: number
    inTransit: number
    cancelled: number
    delayedShipments: number
    rtoShipments: number
    readyToShip: number
    returnsNeedingAction: number
    lowStockCount: number
    links: {
      pending: string
      processing: string
      shipped: string
      cancelled: string
      delivered: string
    }
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
    <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 break-words text-lg font-bold text-gray-900 sm:text-2xl">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">{hint}</p> : null}
    </div>
  )
}

function AlertLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className: string
}) {
  return (
    <li>
      <Link href={href} className={`hover:underline ${className}`}>
        {children}
      </Link>
    </li>
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            LFOUR37 operations overview
            {data?.range ? ` · ${data.range.from} → ${data.range.to}` : ''}
          </p>
        </div>

        <Card className="w-full !p-4 lg:min-w-[280px] lg:max-w-sm">
          <p className="text-sm font-semibold text-gray-900 mb-2">Needs Attention</p>
          {data ? (
            <ul className="space-y-1.5 text-sm">
              <AlertLink
                href={data.alerts.links.pending}
                className="text-red-700"
              >
                {data.alerts.codAwaitingConfirmation} COD awaiting confirmation
              </AlertLink>
              <AlertLink
                href={data.alerts.links.processing}
                className="text-orange-700"
              >
                {data.alerts.packedNotShipped} packed, not shipped
              </AlertLink>
              <AlertLink
                href={data.alerts.links.shipped}
                className="text-orange-700"
              >
                {data.alerts.inTransit} in transit
              </AlertLink>
              <AlertLink
                href={data.alerts.links.shipped}
                className="text-orange-700"
              >
                {data.alerts.delayedShipments} shipments delayed &gt; 3 days
              </AlertLink>
              <AlertLink
                href={data.alerts.links.shipped}
                className="text-orange-700"
              >
                {data.alerts.rtoShipments} RTO shipments
              </AlertLink>
              <AlertLink
                href={data.alerts.links.processing}
                className="text-green-700"
              >
                {data.alerts.readyToShip} orders ready to ship
              </AlertLink>
              <AlertLink
                href={data.alerts.links.delivered}
                className="text-amber-700"
              >
                {data.alerts.returnsNeedingAction} returns needing action
              </AlertLink>
              <AlertLink
                href={data.alerts.links.cancelled}
                className="text-red-700"
              >
                {data.alerts.cancelled} cancelled in range
              </AlertLink>
              <li className="text-orange-700">
                {data.alerts.lowStockCount} low-stock variants
              </li>
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Loading…</p>
          )}
        </Card>
      </div>

      <div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                preset === p.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex shrink-0 items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-auto min-w-[8.5rem]"
              />
              <span className="text-gray-400">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-auto min-w-[8.5rem]"
              />
            </div>
          )}
          {loading && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin self-center text-gray-400" />
          )}
        </div>
        {data?.scopeHint ? (
          <p className="mt-1.5 text-xs text-gray-500">{data.scopeHint}</p>
        ) : null}
      </div>

      {!data ? (
        <div className="h-64 flex items-center justify-center text-gray-400">
          {loading ? 'Loading dashboard…' : 'No data'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi
              label="Orders Placed"
              value={String(data.kpis.ordersPlaced)}
              hint={`Confirmed ${data.kpis.ordersConfirmed} · Pending ${data.kpis.ordersPending} · Cancelled ${data.kpis.ordersCancelled}`}
            />
            <Kpi
              label="Ordered Revenue"
              value={formatPrice(data.kpis.orderedRevenue)}
            />
            <Kpi label="AOV" value={formatPrice(data.kpis.aov)} />
            <Kpi
              label="Items Sold"
              value={String(data.kpis.itemsSold)}
              hint="Same valid-order scope"
            />
            <Kpi label="Delivered" value={String(data.kpis.delivered)} />
            <Kpi label="RTO" value={String(data.kpis.rto)} />
            <Kpi label="Cancelled" value={String(data.kpis.cancelled)} />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              label="Shipped Revenue"
              value={formatPrice(data.kpis.shippedRevenue)}
            />
            <Kpi
              label="Realised / Delivered Revenue"
              value={formatPrice(data.kpis.realisedRevenue)}
            />
            <Kpi label="New" value={String(data.kpis.newCustomers)} />
            <Kpi label="Repeat" value={String(data.kpis.repeatCustomers)} />
            <Kpi
              label="Purchase Conversion"
              value={
                data.kpis.websitePurchaseConversion == null
                  ? 'Tracking issue'
                  : pct(data.kpis.websitePurchaseConversion)
              }
              hint={
                data.kpis.websitePurchaseConversion == null
                  ? undefined
                  : 'Valid orders ÷ sessions'
              }
            />
            <Kpi
              label="Contribution"
              value={
                data.kpis.contribution == null
                  ? 'N/A'
                  : formatPrice(data.kpis.contribution)
              }
              hint={
                data.kpis.contributionMarginPct != null
                  ? `${pct(data.kpis.contributionMarginPct)} margin`
                  : 'Revenue − COGS − shipping − ads'
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Revenue Reconciliation" className="lg:col-span-1">
              <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-500">Ordered</p>
                  <p className="mt-0.5 font-semibold text-gray-900">
                    {formatPrice(data.revenueTiers.ordered)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-500">Shipped</p>
                  <p className="mt-0.5 font-semibold text-gray-900">
                    {formatPrice(data.revenueTiers.shipped)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-gray-500">Realised</p>
                  <p className="mt-0.5 font-semibold text-gray-900">
                    {formatPrice(data.revenueTiers.realised)}
                  </p>
                </div>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Gross product value</dt>
                  <dd className="font-medium">
                    {formatPrice(data.orderedVsRealised.grossProductValue)}
                  </dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>Discounts</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.discounts)}</dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>Cancelled</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.cancelled)}</dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>Returned</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.returned)}</dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>Refunded</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.refunded)}</dd>
                </div>
                <div className="flex justify-between text-red-700">
                  <dt>RTO (extra)</dt>
                  <dd>−{formatPrice(data.orderedVsRealised.rtoExtra)}</dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold text-gray-900">
                  <dt>Net order revenue</dt>
                  <dd>{formatPrice(data.orderedVsRealised.netOrderRevenue)}</dd>
                </div>
              </dl>
              {data.orderedVsRealised.discountsNote ? (
                <p className="mt-2 text-xs text-gray-500">
                  {data.orderedVsRealised.discountsNote}
                </p>
              ) : null}
            </Card>

            <Card title="Trend" className="lg:col-span-2">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['revenue', 'Ordered Revenue'],
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

          <Card title="Contribution Breakdown">
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <div>
                <p className="text-xs text-gray-500">Contribution</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.contributionBreakdown.contribution == null
                    ? 'N/A'
                    : formatPrice(data.contributionBreakdown.contribution)}
                </p>
              </div>
              {data.contributionBreakdown.contributionMarginPct != null ? (
                <p className="text-sm text-gray-600">
                  Margin{' '}
                  <span className="font-semibold text-gray-900">
                    {pct(data.contributionBreakdown.contributionMarginPct)}
                  </span>
                </p>
              ) : null}
              {!data.contributionBreakdown.hasCostData ? (
                <p className="text-xs text-amber-700">
                  Cost data incomplete — set product cost prices for accurate COGS.
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex justify-between rounded-lg bg-gray-50 p-3 sm:block">
                <dt className="text-gray-500">Ordered revenue</dt>
                <dd className="font-semibold">
                  {formatPrice(data.contributionBreakdown.orderedRevenue)}
                </dd>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 p-3 sm:block">
                <dt className="text-gray-500">COGS</dt>
                <dd className="font-semibold text-red-700">
                  −{formatPrice(data.contributionBreakdown.cogs)}
                </dd>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 p-3 sm:block">
                <dt className="text-gray-500">Shipping</dt>
                <dd className="font-semibold text-red-700">
                  −{formatPrice(data.contributionBreakdown.shipping)}
                </dd>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 p-3 sm:block">
                <dt className="text-gray-500">Ads spend</dt>
                <dd className="font-semibold text-red-700">
                  −{formatPrice(data.contributionBreakdown.adsSpend)}
                </dd>
              </div>
            </dl>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Order Status Funnel">
              <p className="text-sm text-gray-700 mb-3">
                <span className="font-semibold">{data.orderFunnel.placed}</span>{' '}
                Placed →{' '}
                <span className="font-semibold">{data.orderFunnel.confirmed}</span>{' '}
                Confirmed →{' '}
                <span className="font-semibold">{data.orderFunnel.packed}</span>{' '}
                Packed →{' '}
                <span className="font-semibold">{data.orderFunnel.shipped}</span>{' '}
                Shipped →{' '}
                <span className="font-semibold">
                  {data.orderFunnel.outForDelivery}
                </span>{' '}
                OFD →{' '}
                <span className="font-semibold">{data.orderFunnel.delivered}</span>{' '}
                Delivered
              </p>
              <p className="text-sm text-gray-600 mb-3">
                {data.orderFunnel.pending} Pending | {data.orderFunnel.cancelled}{' '}
                Cancelled | {data.orderFunnel.rto} RTO |{' '}
                {data.orderFunnel.returned} Returned | {data.orderFunnel.refunded}{' '}
                Refunded
              </p>
              <div className="grid grid-cols-1 gap-2 text-center text-sm sm:grid-cols-3">
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
                      <th>Pending</th>
                      <th>Confirm %</th>
                      <th>Cancel before ship</th>
                      <th>Delivered %</th>
                      <th>RTO %</th>
                      <th>Value at risk</th>
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
                        <td>{row.pendingConfirmation}</td>
                        <td>{pct(row.confirmationRate)}</td>
                        <td>{pct(row.cancelledBeforeShippingPct)}</td>
                        <td>{pct(row.deliveredPct)}</td>
                        <td>{pct(row.rtoRate)}</td>
                        <td>{formatPrice(row.valueAtRisk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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
                  COD in transit:{' '}
                  <span className="font-semibold">
                    {data.paymentSplit.cod.inTransit}
                  </span>
                </p>
                <p>
                  COD cancelled:{' '}
                  <span className="font-semibold">
                    {data.paymentSplit.cod.cancelled}
                  </span>
                </p>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Website Conversion Funnel">
              {data.websiteFunnel.trackingIncomplete ? (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold">Tracking unavailable</p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      {data.websiteFunnel.note ||
                        'Funnel rates hidden until AddToCart / Checkout / Purchase tracking is reliable.'}
                    </p>
                  </div>
                </div>
              ) : data.websiteFunnel.note ? (
                <p className="text-xs text-amber-700 mb-2">{data.websiteFunnel.note}</p>
              ) : null}
              <p className="text-sm text-gray-700 mb-3">
                {data.websiteFunnel.sessions} Visitors →{' '}
                {data.websiteFunnel.productViews} Product views (
                {data.websiteFunnel.sessionsWithProductView} sessions) →{' '}
                {data.websiteFunnel.addToCart} ATC →{' '}
                {data.websiteFunnel.checkoutStarted} Checkout →{' '}
                {data.websiteFunnel.purchases} Purchases
                {data.websiteFunnel.ordersInRange > 0
                  ? ` · ${data.websiteFunnel.ordersInRange} orders in range`
                  : ''}
              </p>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <p>
                  Product viewer rate:{' '}
                  {pct(data.websiteFunnel.productViewerRate)}
                </p>
                <p>
                  Views per visitor:{' '}
                  {data.websiteFunnel.viewsPerVisitor == null
                    ? '—'
                    : data.websiteFunnel.viewsPerVisitor.toFixed(2)}
                </p>
                {data.websiteFunnel.trackingIncomplete ? (
                  <>
                    <p className="text-gray-400">Add-to-cart rate: Tracking unavailable</p>
                    <p className="text-gray-400">Checkout rate: Tracking unavailable</p>
                    <p className="text-gray-400">Purchase rate: Tracking unavailable</p>
                  </>
                ) : (
                  <>
                    <p>Add-to-cart rate: {pct(data.websiteFunnel.addToCartRate)}</p>
                    <p>Checkout rate: {pct(data.websiteFunnel.checkoutRate)}</p>
                    <p>Purchase rate: {pct(data.websiteFunnel.purchaseRate)}</p>
                  </>
                )}
              </div>
            </Card>

            <Card title="Shipment Ageing">
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs text-amber-800">Packed &gt; 24h</p>
                  <p className="text-2xl font-bold text-amber-900">
                    {data.shipmentAgeing.packedOver24h}
                  </p>
                  <p className="mt-1 text-xs text-amber-700">Not yet shipped</p>
                </div>
                <div className="rounded-lg bg-orange-50 p-3">
                  <p className="text-xs text-orange-700">Shipped &gt; 5d</p>
                  <p className="text-2xl font-bold text-orange-800">
                    {data.shipmentAgeing.shippedOver5d}
                  </p>
                  <p className="mt-1 text-xs text-orange-600">Still in transit</p>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs text-red-700">OFD not delivered</p>
                  <p className="text-2xl font-bold text-red-800">
                    {data.shipmentAgeing.ofdNotDelivered}
                  </p>
                  <p className="mt-1 text-xs text-red-600">Out for delivery</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="New vs Returning Customers">
              <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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

            <Card title="Top States">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2">State</th>
                      <th>Orders</th>
                      <th>Revenue</th>
                      <th>AOV</th>
                      <th>COD %</th>
                      <th>RTO %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.topStates.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-gray-400">
                          No state data in range
                        </td>
                      </tr>
                    ) : (
                      data.customers.topStates.map((s) => (
                        <tr key={s.state} className="border-b border-gray-50">
                          <td className="py-2 max-w-[120px] truncate">{s.state}</td>
                          <td>{s.orders}</td>
                          <td>{formatPrice(s.revenue)}</td>
                          <td>{formatPrice(s.aov)}</td>
                          <td>{pct(s.codPct)}</td>
                          <td>{pct(s.rtoPct)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
                          <td>
                            {p.trackingUnavailable
                              ? 'Tracking unavailable'
                              : pct(p.conversion)}
                          </td>
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

            <Card title="Size Sales">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2">Size</th>
                      <th>Units</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sizeSales.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-gray-400">
                          No size sales in range
                        </td>
                      </tr>
                    ) : (
                      data.sizeSales.map((row) => (
                        <tr key={row.size} className="border-b border-gray-50">
                          <td className="py-2 font-medium">{row.size}</td>
                          <td>{row.units}</td>
                          <td>{pct(row.pct)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Top Cities & PIN Codes">
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
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

            <Card title="Cancelled / Returned / RTO">
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
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

            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-gray-200 p-3 sm:flex-row sm:flex-wrap sm:items-end">
              <p className="w-full text-sm font-medium text-gray-800 sm:mb-0">
                Add marketing spend
              </p>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="w-full sm:w-auto">
                  <label className="text-xs text-gray-500">Channel</label>
                  <select
                    className="block w-full border rounded-lg px-2 py-1.5 text-sm sm:w-auto"
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
                <div className="w-full sm:w-auto">
                  <label className="text-xs text-gray-500">Amount (₹)</label>
                  <Input
                    value={spendForm.amount}
                    onChange={(e) =>
                      setSpendForm((s) => ({ ...s, amount: e.target.value }))
                    }
                    className="w-full sm:w-28"
                    type="number"
                    min="0"
                  />
                </div>
                <div className="w-full sm:w-auto">
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
                    className="w-full sm:w-auto"
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <label className="text-xs text-gray-500">Campaign</label>
                  <Input
                    value={spendForm.campaign_name}
                    onChange={(e) =>
                      setSpendForm((s) => ({
                        ...s,
                        campaign_name: e.target.value,
                      }))
                    }
                    className="w-full sm:w-40"
                    placeholder="Optional"
                  />
                </div>
                <Button
                  type="button"
                  onClick={addSpend}
                  loading={savingSpend}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  Save spend
                </Button>
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
        </>
      )}
    </div>
  )
}
