'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react'

type View = 'sales' | 'pos' | 'finance'

function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-gray-400">vs prior period</span>
  }
  const up = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? 'text-emerald-600' : 'text-red-600'
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {value}% vs prior
    </span>
  )
}

function KpiCard({
  label,
  value,
  delta,
  sub,
}: {
  label: string
  value: string
  delta?: number | null
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
      <div className="mt-2">
        <Delta value={delta} />
      </div>
    </div>
  )
}

function TableCard({
  title,
  columns,
  rows,
  empty = 'No data in this period',
}: {
  title: string
  columns: string[]
  rows: Array<Array<string | number>>
  empty?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-4 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-t border-gray-50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 text-gray-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ErpDashboardsClient() {
  const [view, setView] = useState<View>('sales')
  const [preset, setPreset] = useState('90d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/dashboards/erp?view=${view}&preset=${preset}`,
        { cache: 'no-store' }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [view, preset])

  useEffect(() => {
    void load()
  }, [load])

  const label = (data?.label as string) || ''
  const kpis = (data?.kpis || {}) as Record<string, number | null>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboards</h1>
          <p className="mt-1 text-sm text-gray-600">
            Sales, Point of Sale, and Finance views (Odoo-style KPIs from your live
            data).
          </p>
        </div>
        <Link
          href="/admin/dashboards/ops"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          Open detailed Ops dashboard →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(
            [
              ['sales', 'Sales'],
              ['pos', 'Point of Sale'],
              ['finance', 'Finance'],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                view === id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <select
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="this_month">This month</option>
        </select>
        {label ? (
          <span className="text-xs text-gray-500">Period: {label}</span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : view === 'sales' ? (
        <SalesView data={data!} kpis={kpis} />
      ) : view === 'pos' ? (
        <PosView data={data!} kpis={kpis} />
      ) : (
        <FinanceView data={data!} kpis={kpis} />
      )}
    </div>
  )
}

function SalesView({
  data,
  kpis,
}: {
  data: Record<string, unknown>
  kpis: Record<string, number | null>
}) {
  const monthly = (data.monthlySales || []) as Array<{
    month: string
    revenue: number
  }>
  const topProducts = (data.topProducts || []) as Array<{
    product: string
    orders: number
    revenue: number
  }>
  const topCustomers = (data.topCustomers || []) as Array<{
    customer: string
    orders: number
    revenue: number
  }>
  const topSources = (data.topSources || []) as Array<{
    source: string
    orders: number
    revenue: number
  }>
  const topOrders = (data.topSalesOrders || []) as Array<{
    reference: string
    customer: string
    total: number
    status: string
  }>
  const placeholders = data.placeholders as { quotations?: string } | undefined

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Quotations"
          value={String(kpis.quotations ?? 0)}
          delta={kpis.quotationsDelta}
          sub={placeholders?.quotations}
        />
        <KpiCard
          label="Orders"
          value={String(kpis.orders ?? 0)}
          delta={kpis.ordersDelta}
        />
        <KpiCard
          label="Revenue"
          value={formatPrice(Number(kpis.revenue || 0))}
          delta={kpis.revenueDelta}
        />
        <KpiCard
          label="Average Order"
          value={formatPrice(Number(kpis.averageOrder || 0))}
          delta={kpis.averageOrderDelta}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Monthly Sales</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v) => formatPrice(Number(v ?? 0))}
                contentStyle={{ borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#7c3aed"
                fill="#ddd6fe"
                name="Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard
          title="Top Products"
          columns={['Product', 'Qty', 'Revenue']}
          rows={topProducts.map((r) => [
            r.product,
            r.orders,
            formatPrice(r.revenue),
          ])}
        />
        <TableCard
          title="Top Customers"
          columns={['Customer', 'Orders', 'Revenue']}
          rows={topCustomers.map((r) => [
            r.customer,
            r.orders,
            formatPrice(r.revenue),
          ])}
        />
        <TableCard
          title="Top Sources"
          columns={['Source', 'Orders', 'Revenue']}
          rows={topSources.map((r) => [
            r.source,
            r.orders,
            formatPrice(r.revenue),
          ])}
        />
        <TableCard
          title="Top Sales Orders"
          columns={['Order', 'Customer', 'Total', 'Status']}
          rows={topOrders.map((r) => [
            r.reference,
            r.customer,
            formatPrice(r.total),
            r.status,
          ])}
        />
      </div>
    </div>
  )
}

function PosView({
  data,
  kpis,
}: {
  data: Record<string, unknown>
  kpis: Record<string, number | null>
}) {
  const topOrders = (data.topOrders || []) as Array<{
    sale_number: string
    date: string
    payment_method: string
    total: number
  }>
  const topSessions = (data.topSessions || []) as Array<{
    session: string
    orders: number
    revenue: number
  }>
  const topPos = (data.topPointsOfSale || []) as Array<{
    pointOfSale: string
    orders: number
    revenue: number
  }>
  const topProducts = (data.topProducts || []) as Array<{
    product: string
    qty: number
    revenue: number
  }>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="POS Orders"
          value={String(kpis.orders ?? 0)}
          delta={kpis.ordersDelta}
        />
        <KpiCard
          label="Revenue"
          value={formatPrice(Number(kpis.revenue || 0))}
          delta={kpis.revenueDelta}
        />
        <KpiCard
          label="Average Ticket"
          value={formatPrice(Number(kpis.averageTicket || 0))}
        />
        <KpiCard label="Sessions" value={String(kpis.sessions ?? 0)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Cash" value={formatPrice(Number(kpis.cash || 0))} />
        <KpiCard label="UPI" value={formatPrice(Number(kpis.upi || 0))} />
        <KpiCard label="Card" value={formatPrice(Number(kpis.card || 0))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard
          title="Top Orders"
          columns={['Sale', 'Payment', 'Total']}
          rows={topOrders.map((r) => [
            r.sale_number,
            r.payment_method,
            formatPrice(r.total),
          ])}
        />
        <TableCard
          title="Top Sessions"
          columns={['Session', 'Orders', 'Revenue']}
          rows={topSessions.map((r) => [
            r.session,
            r.orders,
            formatPrice(r.revenue),
          ])}
        />
        <TableCard
          title="Top Points of Sale"
          columns={['Location', 'Orders', 'Revenue']}
          rows={topPos.map((r) => [
            r.pointOfSale,
            r.orders,
            formatPrice(r.revenue),
          ])}
        />
        <TableCard
          title="Top Products"
          columns={['Product', 'Qty', 'Revenue']}
          rows={topProducts.map((r) => [
            r.product,
            r.qty,
            formatPrice(r.revenue),
          ])}
        />
      </div>
    </div>
  )
}

function FinanceView({
  data,
  kpis,
}: {
  data: Record<string, unknown>
  kpis: Record<string, number | null>
}) {
  const monthly = (data.invoicedByMonth || []) as Array<{
    month: string
    amount: number
  }>
  const topInvoices = (data.topInvoices || []) as Array<{
    reference: string
    customer: string
    status: string
    amount: number
    channel: string
  }>
  const profitability = data.profitability as {
    income: number
    note: string
  }
  const balance = data.balanceProxies as { receivable: number }
  const parity = data.odooParity as {
    availableNow: string[]
    needsAccountingModule: string[]
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Invoiced"
          value={formatPrice(Number(kpis.invoiced || 0))}
          delta={kpis.invoicedDelta}
          sub={`${formatPrice(Number(kpis.unpaid || 0))} unpaid`}
        />
        <KpiCard
          label="Average Invoice"
          value={formatPrice(Number(kpis.averageInvoice || 0))}
          sub={`${kpis.invoiceCount || 0} invoices`}
        />
        <KpiCard label="DSO (approx.)" value={`${kpis.dso ?? 0} days`} />
        <KpiCard
          label="Payments collected"
          value={formatPrice(Number(kpis.paymentCollected || 0))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Income (proxy)</h3>
          <p className="mt-2 text-2xl font-bold">
            {formatPrice(profitability?.income || 0)}
          </p>
          <p className="mt-2 text-xs text-gray-500">{profitability?.note}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Receivables</h3>
          <p className="mt-2 text-2xl font-bold">
            {formatPrice(balance?.receivable || 0)}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Unpaid / pending online orders in period
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">
          Invoiced by Month
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPrice(Number(v ?? 0))} />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#0ea5e9"
                fill="#bae6fd"
                name="Invoiced"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <TableCard
        title="Top Invoices"
        columns={['Reference', 'Customer', 'Channel', 'Status', 'Amount']}
        rows={topInvoices.map((r) => [
          r.reference,
          r.customer,
          r.channel,
          r.status,
          formatPrice(r.amount),
        ])}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
          <h3 className="font-semibold text-emerald-900">Available now</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-emerald-800">
            {(parity?.availableNow || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm">
          <h3 className="font-semibold text-amber-900">
            Needs full Accounting module (later)
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
            {(parity?.needsAccountingModule || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        For GST working reports, open{' '}
        <Link href="/admin/reports/gst" className="font-medium text-violet-700 underline">
          GST Reports
        </Link>
        .
      </p>
    </div>
  )
}
