'use client'

import { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Line = {
  barcode: string
  variant_id: string
  product_name: string
  size: string
  color: string
  stock: number
  quantity: number
}

type Transfer = {
  id: string
  transfer_number: string
  status: string
  created_at: string
  from_location?: { name: string; code: string } | Array<{ name: string; code: string }>
  to_location?: { name: string; code: string } | Array<{ name: string; code: string }>
}

function locName(
  loc?: { name: string; code: string } | Array<{ name: string; code: string }>
) {
  if (!loc) return '—'
  const row = Array.isArray(loc) ? loc[0] : loc
  return row ? `${row.name} (${row.code})` : '—'
}

export function StockTransferClient() {
  const [destination, setDestination] = useState<'online' | 'store' | 'both'>(
    'online'
  )
  const [notes, setNotes] = useState('')
  const [barcode, setBarcode] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [pending, startTransition] = useTransition()

  const load = async () => {
    const res = await fetch('/api/admin/inventory/transfers')
    const data = await res.json()
    if (res.ok) setTransfers(data.transfers || [])
  }

  useEffect(() => {
    void load()
  }, [])

  const addLine = async () => {
    const code = barcode.trim()
    if (!code) return
    const res = await fetch(`/api/admin/pos?barcode=${encodeURIComponent(code)}`)
    const data = await res.json()
    if (!res.ok && res.status !== 409) {
      toast.error(data.error || 'Barcode not found')
      return
    }
    const item = data.item
    if (!item) {
      toast.error('Barcode not found')
      return
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.variant_id === item.variant_id)
      if (existing) {
        return prev.map((l) =>
          l.variant_id === item.variant_id
            ? { ...l, quantity: l.quantity + 1 }
            : l
        )
      }
      return [
        ...prev,
        {
          barcode: code,
          variant_id: item.variant_id,
          product_name: item.product_name,
          size: item.size,
          color: item.color,
          stock: item.stock,
          quantity: 1,
        },
      ]
    })
    setBarcode('')
  }

  const postTransfer = () => {
    if (lines.length === 0) {
      toast.error('Add at least one item')
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/admin/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          notes: notes || null,
          items: lines.map((line) => ({
            variant_id: line.variant_id,
            quantity: line.quantity,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Transfer failed')
        return
      }
      const nums = (data.transfers || [])
        .map((t: { transfer_number: string }) => t.transfer_number)
        .join(', ')
      toast.success(`Transferred: ${nums || 'OK'}`)
      setLines([])
      setNotes('')
      await load()
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock transfer</h1>
        <p className="mt-1 text-sm text-gray-600">
          Move stock from Warehouse to Online (website), Store (POS), or both.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['online', 'To Online'],
              ['store', 'To Store'],
              ['both', 'To Online + Store'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDestination(value)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                destination === value
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Input
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void addLine()
          }}
        >
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan barcode"
            className="font-mono"
          />
          <Button type="submit">Add</Button>
        </form>

        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.variant_id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-medium">{line.product_name}</div>
                    <div className="text-xs text-gray-500">
                      {line.size} / {line.color} · {line.barcode}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      className="w-20 rounded border px-2 py-1"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.variant_id === line.variant_id
                              ? {
                                  ...l,
                                  quantity: Math.max(1, Number(e.target.value) || 1),
                                }
                              : l
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="text-sm text-red-600"
                      onClick={() =>
                        setLines((prev) =>
                          prev.filter((l) => l.variant_id !== line.variant_id)
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                    No lines yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Button type="button" onClick={postTransfer} loading={pending}>
          Post transfer from Warehouse
        </Button>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold">Recent transfers</h2>
        <ul className="space-y-2 text-sm">
          {transfers.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap justify-between gap-2 border-b py-2 last:border-0"
            >
              <span className="font-mono">{t.transfer_number}</span>
              <span className="text-gray-500">
                {locName(t.from_location)} → {locName(t.to_location)} · {t.status}
              </span>
            </li>
          ))}
          {transfers.length === 0 && (
            <li className="text-gray-500">No transfers yet</li>
          )}
        </ul>
      </div>
    </div>
  )
}
