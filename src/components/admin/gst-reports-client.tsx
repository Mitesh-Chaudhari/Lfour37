'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { downloadCsv } from '@/lib/reports'

type GstResponse = {
  range: { from: string; to: string }
  totals: {
    invoiceCount: number
    taxable: number
    cgst: number
    sgst: number
    igst: number
    total: number
    onlineTotal: number
    storeTotal: number
    gstRatePercent: number
  }
  hsnSummary: Array<{
    hsn: string
    quantity: number
    taxable: number
    cgst: number
    sgst: number
    igst: number
  }>
  invoices: Array<{
    channel: 'online' | 'store'
    number: string
    date: string
    placeOfSupply: string
    taxType: string
    taxable: number
    cgst: number
    sgst: number
    igst: number
    total: number
  }>
  note: string
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

export function GstReportsClient() {
  const defaults = defaultRange()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [data, setData] = useState<GstResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const load = (nextFrom = from, nextTo = to) => {
    startTransition(async () => {
      setError(null)
      const res = await fetch(
        `/api/admin/reports/gst?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to load GST report')
        return
      }
      setData(json)
    })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportHsn = () => {
    if (!data) return
    downloadCsv(`gstr-hsn-${data.range.from}_to_${data.range.to}.csv`, [
      ['HSN', 'Qty', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total tax'],
      ...data.hsnSummary.map((row) => [
        row.hsn,
        String(row.quantity),
        row.taxable.toFixed(2),
        row.cgst.toFixed(2),
        row.sgst.toFixed(2),
        row.igst.toFixed(2),
        (row.cgst + row.sgst + row.igst).toFixed(2),
      ]),
    ])
  }

  const exportInvoices = () => {
    if (!data) return
    downloadCsv(`gstr-invoices-${data.range.from}_to_${data.range.to}.csv`, [
      [
        'Channel',
        'Number',
        'Date',
        'Place of supply',
        'Tax type',
        'Taxable',
        'CGST',
        'SGST',
        'IGST',
        'Invoice total',
      ],
      ...data.invoices.map((row) => [
        row.channel,
        row.number,
        new Date(row.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        row.placeOfSupply,
        row.taxType,
        row.taxable.toFixed(2),
        row.cgst.toFixed(2),
        row.sgst.toFixed(2),
        row.igst.toFixed(2),
        row.total.toFixed(2),
      ]),
    ])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">GST / accounting reports</h1>
        <p className="mt-1 text-sm text-gray-600">
          Working papers for Yadevi sales tax (online + store). Export CSV for your CA.
          This is not a GST portal filing tool.
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
        <Button type="button" variant="outline" onClick={exportHsn} disabled={!data}>
          Export HSN CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={exportInvoices}
          disabled={!data}
        >
          Export invoices CSV
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
            <Stat label="Invoices" value={String(data.totals.invoiceCount)} />
            <Stat label="Taxable value" value={inr(data.totals.taxable)} />
            <Stat
              label="CGST + SGST + IGST"
              value={inr(data.totals.cgst + data.totals.sgst + data.totals.igst)}
            />
            <Stat label="Gross sales" value={inr(data.totals.total)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Online sales" value={inr(data.totals.onlineTotal)} />
            <Stat label="Store POS sales" value={inr(data.totals.storeTotal)} />
            <Stat
              label="Assumed GST rate"
              value={`${data.totals.gstRatePercent}%`}
            />
          </div>

          <p className="text-xs text-gray-500">{data.note}</p>

          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">HSN summary (GSTR-1 style)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">HSN</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">Taxable</th>
                    <th className="py-2 pr-3">CGST</th>
                    <th className="py-2 pr-3">SGST</th>
                    <th className="py-2">IGST</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hsnSummary.map((row) => (
                    <tr key={row.hsn} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{row.hsn}</td>
                      <td className="py-2 pr-3">{row.quantity}</td>
                      <td className="py-2 pr-3">{inr(row.taxable)}</td>
                      <td className="py-2 pr-3">{inr(row.cgst)}</td>
                      <td className="py-2 pr-3">{inr(row.sgst)}</td>
                      <td className="py-2">{inr(row.igst)}</td>
                    </tr>
                  ))}
                  {data.hsnSummary.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500">
                        No taxable sales in this range
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Invoice / bill list</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Number</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Place</th>
                    <th className="py-2 pr-3">Tax</th>
                    <th className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((row) => (
                    <tr key={`${row.channel}-${row.number}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 capitalize">{row.channel}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.number}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">
                        {new Date(row.date).toLocaleDateString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                        })}
                      </td>
                      <td className="py-2 pr-3">{row.placeOfSupply}</td>
                      <td className="py-2 pr-3 text-xs">{row.taxType}</td>
                      <td className="py-2">{inr(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  )
}
