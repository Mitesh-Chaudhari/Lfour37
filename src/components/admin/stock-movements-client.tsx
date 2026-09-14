'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

type Movement = {
  id: string
  movement_type: string
  quantity: number
  quantity_before: number
  quantity_after: number
  reference_type: string | null
  notes: string | null
  created_at: string
  product: { id: string; name: string; sku: string | null } | null
  variant: {
    id: string
    size: string
    color: string
    barcode: string | null
    sku: string | null
  } | null
}

const TYPE_LABELS: Record<string, string> = {
  online_sale: 'Online sale',
  pos_sale: 'Store POS sale',
  sale_return: 'Return',
  cancel_restore: 'Cancel restore',
  grn_receive: 'Stock received',
  adjustment: 'Adjustment',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
}

export function StockMovementsClient() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [type, setType] = useState('all')
  const [pending, startTransition] = useTransition()

  const load = (filterType = type) => {
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/inventory/movements?type=${encodeURIComponent(filterType)}&limit=150`
      )
      const data = await res.json()
      if (res.ok) setMovements(data.movements || [])
    })
  }

  useEffect(() => {
    load('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock movements</h1>
          <p className="mt-1 text-sm text-gray-600">
            Every stock change from online orders, store POS, receive stock, and
            cancels — newest first.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              load(e.target.value)
            }}
          >
            <option value="all">All types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            loading={pending}
            onClick={() => load()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2">Before → After</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
              const product = Array.isArray(m.product) ? m.product[0] : m.product
              const variant = Array.isArray(m.variant) ? m.variant[0] : m.variant
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                    {new Date(m.created_at).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                    })}
                  </td>
                  <td className="px-3 py-3">
                    {TYPE_LABELS[m.movement_type] || m.movement_type}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{product?.name || '—'}</div>
                    <div className="text-xs text-gray-500">
                      {variant
                        ? `${variant.size} / ${variant.color}${
                            variant.barcode ? ` · ${variant.barcode}` : ''
                          }`
                        : ''}
                    </div>
                  </td>
                  <td
                    className={`px-3 py-3 font-semibold ${
                      m.quantity < 0 ? 'text-red-600' : 'text-green-700'
                    }`}
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="px-3 py-3 text-gray-600">
                    {m.quantity_before} → {m.quantity_after}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    {m.notes || m.reference_type || '—'}
                  </td>
                </tr>
              )
            })}
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  {pending
                    ? 'Loading…'
                    : 'No movements yet. Complete a POS sale, online order, or receive stock.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
