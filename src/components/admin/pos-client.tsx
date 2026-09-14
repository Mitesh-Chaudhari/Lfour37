'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LFOUR37_STORE_JAMNAGAR_LOCATION_ID } from '@/lib/organization'

type CartLine = {
  variant_id: string
  product_id: string
  product_name: string
  size: string
  color: string
  barcode: string | null
  unit_price: number
  stock: number
  quantity: number
  image: string | null
}

type Session = {
  id: string
  location_id: string
  opened_at: string
  opening_float: number
  status: string
}

type PosClientProps = {
  locationId?: string
  locationName?: string
}

export function PosClient({
  locationId = LFOUR37_STORE_JAMNAGAR_LOCATION_ID,
  locationName = 'LFOUR37 Store – Jamnagar',
}: PosClientProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [barcode, setBarcode] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>(
    'upi'
  )
  const [discount, setDiscount] = useState(0)
  const [closingCash, setClosingCash] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const subtotal = cart.reduce(
    (sum, line) => sum + line.unit_price * line.quantity,
    0
  )
  const total = Math.max(0, subtotal - discount)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const ensureSession = async () => {
    const res = await fetch('/api/admin/pos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'open_session',
        location_id: locationId,
        opening_float: 0,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to open session')
    setSession(data.session)
    return data.session as Session
  }

  const addByBarcode = async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return

    try {
      let activeSession = session
      if (!activeSession) {
        activeSession = await ensureSession()
      }

      const res = await fetch(
        `/api/admin/pos?barcode=${encodeURIComponent(trimmed)}`
      )
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Barcode not found')
        return
      }

      const item = data.item as CartLine & { variant_id: string }
      setCart((prev) => {
        const existing = prev.find((line) => line.variant_id === item.variant_id)
        if (existing) {
          if (existing.quantity + 1 > item.stock) {
            toast.error('Not enough stock')
            return prev
          }
          return prev.map((line) =>
            line.variant_id === item.variant_id
              ? { ...line, quantity: line.quantity + 1, stock: item.stock }
              : line
          )
        }
        return [
          ...prev,
          {
            variant_id: item.variant_id,
            product_id: item.product_id,
            product_name: item.product_name,
            size: item.size,
            color: item.color,
            barcode: item.barcode,
            unit_price: item.unit_price,
            stock: item.stock,
            quantity: 1,
            image: item.image,
          },
        ]
      })
      setBarcode('')
      inputRef.current?.focus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Scan failed')
    }
  }

  const completeSale = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }

    startTransition(async () => {
      try {
        const activeSession = session || (await ensureSession())
        const res = await fetch('/api/admin/pos/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: activeSession.id,
            location_id: locationId,
            payment_method: paymentMethod,
            discount_amount: discount,
            items: cart.map((line) => ({
              variant_id: line.variant_id,
              quantity: line.quantity,
            })),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Sale failed')
          return
        }
        toast.success(`Sold ${data.sale.sale_number} · ₹${data.sale.total}`)
        setCart([])
        setDiscount(0)
        inputRef.current?.focus()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Sale failed')
      }
    })
  }

  const closeDay = () => {
    if (!session) {
      toast.error('No open session')
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/admin/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_session',
          session_id: session.id,
          counted_cash: Number(closingCash || 0),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Close failed')
        return
      }
      toast.success(
        `Day closed · Sales ₹${data.summary.total_sales} · Cash expected ₹${data.summary.expected_cash}`
      )
      setSession(null)
      setCart([])
      setClosingCash('')
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">POS</h1>
            <p className="text-sm text-gray-500">{locationName}</p>
          </div>
          <div className="text-sm text-gray-600">
            {session ? (
              <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">
                Session open
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await ensureSession()
                      toast.success('Session opened')
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : 'Failed to open'
                      )
                    }
                  })
                }
                loading={pending}
              >
                Open session
              </Button>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void addByBarcode(barcode)
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan or type barcode, then Enter"
            className="font-mono text-lg"
            autoComplete="off"
          />
          <Button type="submit" loading={pending}>
            Add
          </Button>
        </form>

        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.variant_id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-medium">{line.product_name}</div>
                    <div className="text-xs text-gray-500">
                      {line.size} / {line.color}
                      {line.barcode ? ` · ${line.barcode}` : ''}
                      {` · stock ${line.stock}`}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={1}
                      max={line.stock}
                      value={line.quantity}
                      className="w-16 rounded border px-2 py-1"
                      onChange={(e) => {
                        const qty = Math.max(1, Number(e.target.value) || 1)
                        setCart((prev) =>
                          prev.map((l) =>
                            l.variant_id === line.variant_id
                              ? { ...l, quantity: Math.min(qty, l.stock) }
                              : l
                          )
                        )
                      }}
                    />
                  </td>
                  <td className="px-3 py-3">₹{line.unit_price.toFixed(2)}</td>
                  <td className="px-3 py-3 font-medium">
                    ₹{(line.unit_price * line.quantity).toFixed(2)}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="text-sm text-red-600"
                      onClick={() =>
                        setCart((prev) =>
                          prev.filter((l) => l.variant_id !== line.variant_id)
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    Scan a barcode to add items. Sale deducts shared stock used by
                    the online store.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Discount</span>
            <input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              className="w-28 rounded border px-2 py-1 text-right"
            />
          </div>
          <div className="flex justify-between border-t pt-2 text-lg font-bold">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Payment</p>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'upi', 'card'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium uppercase ${
                  paymentMethod === method
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          size="lg"
          onClick={completeSale}
          loading={pending}
          disabled={cart.length === 0}
        >
          Complete sale
        </Button>

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Day close</p>
          <Input
            label="Counted cash in drawer"
            type="number"
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            placeholder="0"
          />
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={closeDay}
            loading={pending}
            disabled={!session}
          >
            Close session
          </Button>
        </div>
      </div>
    </div>
  )
}
