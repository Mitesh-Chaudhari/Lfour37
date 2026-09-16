'use client'

import { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type PoItem = {
  id: string
  variant_id: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  product?: { name: string; sku: string | null } | null
  variant?: { size: string; color: string; barcode: string | null } | null
}

type PurchaseOrder = {
  id: string
  po_number: string
  supplier_name: string
  status: string
  notes: string | null
  created_at: string
  items: PoItem[]
  invoices?: Array<{ id: string; invoice_number: string; status: string; total: number }>
}

type Line = {
  barcode: string
  variant_id: string
  product_name: string
  size: string
  color: string
  quantity: number
  unit_cost: string
}

export function PurchaseOrdersClient() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [barcode, setBarcode] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [pending, startTransition] = useTransition()

  const load = async () => {
    const res = await fetch('/api/admin/procurement/purchase-orders')
    const data = await res.json()
    if (res.ok) setOrders(data.purchase_orders || [])
  }

  useEffect(() => {
    void load()
  }, [])

  const addLine = async () => {
    const code = barcode.trim()
    if (!code) return
    const res = await fetch(`/api/admin/pos?barcode=${encodeURIComponent(code)}`)
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Barcode not found')
      return
    }
    const item = data.item
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
          quantity: 1,
          unit_cost: '',
        },
      ]
    })
    setBarcode('')
  }

  const createDraft = () => {
    if (!supplier.trim()) {
      toast.error('Supplier name is required')
      return
    }
    if (lines.length === 0) {
      toast.error('Add at least one item')
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/admin/procurement/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: supplier.trim(),
          notes: notes || null,
          items: lines.map((line) => ({
            variant_id: line.variant_id,
            quantity_ordered: line.quantity,
            unit_cost: line.unit_cost ? Number(line.unit_cost) : 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to create PO')
        return
      }
      toast.success(`Draft ${data.purchase_order.po_number} created`)
      setLines([])
      setSupplier('')
      setNotes('')
      await load()
    })
  }

  const confirmPo = (poId: string) => {
    startTransition(async () => {
      const res = await fetch('/api/admin/procurement/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', po_id: poId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Confirm failed')
        return
      }
      toast.success(
        `PO confirmed · Invoice ${data.purchase_invoice?.invoice_number || ''} created`
      )
      await load()
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Purchase orders</h1>
        <p className="mt-1 text-sm text-gray-600">
          Create a PO → confirm to auto-create the purchase invoice → receive on GRN
          into Warehouse.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">New draft PO</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Supplier name"
          />
          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>

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
            placeholder="Scan barcode to add"
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
                <th className="px-3 py-2">Unit cost</th>
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
                    <input
                      type="number"
                      min={0}
                      value={line.unit_cost}
                      className="w-28 rounded border px-2 py-1"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.variant_id === line.variant_id
                              ? { ...l, unit_cost: e.target.value }
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
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                    Scan items to build the PO
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Button type="button" onClick={createDraft} loading={pending}>
          Save draft PO
        </Button>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Purchase orders</h2>
        <div className="space-y-4">
          {orders.map((po) => {
            const invoice = po.invoices?.[0]
            return (
              <div key={po.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-semibold">{po.po_number}</div>
                    <div className="text-sm text-gray-600">
                      {po.supplier_name} · {po.status}
                      {invoice
                        ? ` · Invoice ${invoice.invoice_number} (${invoice.status})`
                        : ''}
                    </div>
                  </div>
                  {po.status === 'draft' && (
                    <Button
                      type="button"
                      size="sm"
                      loading={pending}
                      onClick={() => confirmPo(po.id)}
                    >
                      Confirm & create invoice
                    </Button>
                  )}
                </div>
                <ul className="mt-3 space-y-1 text-sm text-gray-700">
                  {(po.items || []).map((item) => (
                    <li key={item.id}>
                      {item.product?.name || 'Item'} · {item.variant?.size}/
                      {item.variant?.color} — ordered {item.quantity_ordered}, received{' '}
                      {item.quantity_received}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {orders.length === 0 && (
            <p className="text-sm text-gray-500">No purchase orders yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
