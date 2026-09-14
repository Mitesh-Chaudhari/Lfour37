'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { downloadCsv } from '@/lib/reports'

type ChannelResponse = {
  range: { from: string; to: string }
  summary: {
    onlineTotal: number
    storeTotal: number
    combined: number
    onlineOrders: number
    storeOrders: number
    onlineSharePct: number
    storeSharePct: number
    onlineAov: number
    storeAov: number
  }
  daily: Array<{
    date: string
    online: number
    store: number
    onlineOrders: number
    storeOrders: number
  }>
  paymentMix: {
    online: Record<string, number>
    store: Record<string, number>
  }
}

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function defaultRange() {
  const to = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - 29)
  const from = fromDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  return { from, to }
}

export function ChannelSalesClient() {
  const defaults = defaultRange()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [data, setData] = useState<ChannelResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const load = (nextFrom = from, nextTo = to) => {
    startTransition(async () => {
      setError(null)
      const res = await fetch(
        `/api/admin/reports/channel-sales?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to load channel sales')
        return
      }
      setData(json)
    })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportDaily = () => {
    if (!data) return
    downloadCsv(`channel-sales-${data.range.from}_to_${data.range.to}.csv`, [
      ['Date', 'Online revenue', 'Online orders', 'Store revenue', 'Store orders', 'Combined'],
      ...data.daily.map((row) => [
        row.date,
        row.online.toFixed(2),
        String(row.onlineOrders),
        row.store.toFixed(2),
        String(row.storeOrders),
        (row.online + row.store).toFixed(2),
      ]),
    ])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Online vs store sales</h1>
        <p className="mt-1 text-sm text-gray-600">
          Compare website orders and Jamnagar POS bills for the selected dates
          (respects brand filter in the sidebar).
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-end">
        <Input
          label="From"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button type="button" loading={pending} onClick={() => load(from, to)}>
          Run report
        </Button>
        <Button type="button" variant="outline" onClick={exportDaily} disabled={!data}>
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Combined sales" value={inr(data.summary.combined)} />
            <Stat
              label="Online"
              value={`${inr(data.summary.onlineTotal)} (${data.summary.onlineSharePct}%)`}
            />
            <Stat
              label="Store POS"
              value={`${inr(data.summary.storeTotal)} (${data.summary.storeSharePct}%)`}
            />
            <Stat
              label="Orders / bills"
              value={`${data.summary.onlineOrders} online · ${data.summary.storeOrders} store`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Online AOV" value={inr(data.summary.onlineAov)} />
            <Stat label="Store AOV" value={inr(data.summary.storeAov)} />
          </div>

          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-4 text-lg font-semibold">Daily trend</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="online"
                    name="Online"
                    stackId="1"
                    stroke="#7c3aed"
                    fill="#ddd6fe"
                  />
                  <Area
                    type="monotone"
                    dataKey="store"
                    name="Store"
                    stackId="1"
                    stroke="#059669"
                    fill="#a7f3d0"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <PaymentCard title="Online payment mix" mix={data.paymentMix.online} />
            <PaymentCard title="Store payment mix" mix={data.paymentMix.store} />
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function PaymentCard({
  title,
  mix,
}: {
  title: string
  mix: Record<string, number>
}) {
  const entries = Object.entries(mix)
  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No sales in range</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {entries.map(([method, amount]) => (
            <li key={method} className="flex justify-between border-b py-2 last:border-0">
              <span className="uppercase text-gray-600">{method}</span>
              <span className="font-medium">{inr(amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
