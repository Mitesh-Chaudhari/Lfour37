'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type VariantRow = {
  id: string
  size: string
  color: string
  stock: number
  barcode: string | null
  product_name: string
  product_sku: string | null
  product_status: string
}

export function BarcodesClient() {
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [filter, setFilter] = useState<'all' | 'missing' | 'has'>('missing')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [pending, startTransition] = useTransition()

  const load = () => {
    startTransition(async () => {
      const res = await fetch('/api/admin/inventory/barcodes')
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to load')
        return
      }
      setVariants(data.variants || [])
    })
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return variants.filter((v) => {
      if (filter === 'missing' && v.barcode) return false
      if (filter === 'has' && !v.barcode) return false
      if (!q) return true
      return (
        v.product_name.toLowerCase().includes(q) ||
        (v.barcode || '').toLowerCase().includes(q) ||
        v.size.toLowerCase().includes(q) ||
        v.color.toLowerCase().includes(q)
      )
    })
  }, [variants, filter, search])

  const selectedRows = filtered.filter((v) => selected[v.id] && v.barcode)

  const bulkGenerate = () => {
    startTransition(async () => {
      const res = await fetch('/api/admin/inventory/barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_generate_missing' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Generate failed')
        return
      }
      toast.success(`Generated barcodes for ${data.updated} variants`)
      load()
    })
  }

  const printSelected = () => {
    if (selectedRows.length === 0) {
      toast.error('Select variants that already have barcodes')
      return
    }

    const html = `<!doctype html>
<html>
<head>
  <title>Barcode labels</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .label { border: 1px solid #ccc; padding: 10px; border-radius: 6px; page-break-inside: avoid; }
    .name { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 11px; color: #444; }
    .code { font-family: ui-monospace, monospace; font-size: 16px; letter-spacing: 1px; margin-top: 8px; }
    @media print { body { margin: 0; } .label { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="grid">
    ${selectedRows
      .map(
        (row) => `
      <div class="label">
        <div class="name">${escapeHtml(row.product_name)}</div>
        <div class="meta">${escapeHtml(row.size)} / ${escapeHtml(row.color)}</div>
        <div class="code">${escapeHtml(row.barcode || '')}</div>
      </div>`
      )
      .join('')}
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
    if (!w) {
      toast.error('Allow pop-ups to print labels')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Barcodes</h1>
        <p className="mt-1 text-sm text-gray-600">
          Assign barcodes to size/color variants, bulk-fill missing ones, then
          print simple labels for the store scanner.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="missing">Missing barcode</option>
            <option value="has">Has barcode</option>
            <option value="all">All variants</option>
          </select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product / barcode"
            className="w-56"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" loading={pending} onClick={load}>
            Refresh
          </Button>
          <Button type="button" variant="outline" loading={pending} onClick={bulkGenerate}>
            Generate missing
          </Button>
          <Button type="button" onClick={printSelected}>
            Print selected ({selectedRows.length})
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    const next: Record<string, boolean> = {}
                    if (e.target.checked) {
                      for (const row of filtered) next[row.id] = true
                    }
                    setSelected(next)
                  }}
                />
              </th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Variant</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Barcode</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={!!selected[row.id]}
                    onChange={(e) =>
                      setSelected((prev) => ({
                        ...prev,
                        [row.id]: e.target.checked,
                      }))
                    }
                  />
                </td>
                <td className="px-3 py-3 font-medium">{row.product_name}</td>
                <td className="px-3 py-3 text-gray-600">
                  {row.size} / {row.color}
                </td>
                <td className="px-3 py-3">{row.stock}</td>
                <td className="px-3 py-3">
                  <input
                    className="w-48 rounded border px-2 py-1 font-mono text-xs"
                    defaultValue={row.barcode || ''}
                    placeholder="Set barcode"
                    onBlur={async (e) => {
                      const value = e.target.value.trim()
                      if (!value || value === (row.barcode || '')) return
                      const res = await fetch('/api/admin/inventory/barcodes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'set_barcode',
                          variant_id: row.id,
                          barcode: value,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok) {
                        toast.error(data.error || 'Save failed')
                        return
                      }
                      toast.success('Barcode saved')
                      load()
                    }}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                  {pending ? 'Loading…' : 'No variants match this filter'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
