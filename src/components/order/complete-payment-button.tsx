'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { RazorpayPaymentForm } from '@/components/checkout/razorpay-payment-form'
import { getOnlineChargeAmount } from '@/lib/pending-payment'

type Props = {
  orderId: string
  orderNumber: string
  paymentMethod: string
  total: number
  shippingAmount?: number | null
  codAdvanceAmount?: number | null
  expiresAt: string
}

export default function CompletePaymentButton({
  orderId,
  orderNumber,
  paymentMethod,
  total,
  shippingAmount,
  codAdvanceAmount,
  expiresAt,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [razorpayOrder, setRazorpayOrder] = useState<{
    id: string
    amount: number
    currency: string
  } | null>(null)

  const amount = getOnlineChargeAmount({
    id: orderId,
    payment_method: paymentMethod,
    total,
    shipping_amount: shippingAmount,
    cod_advance_amount: codAdvanceAmount,
  })

  const expiresLabel = new Date(expiresAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const startPayment = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await res.json()

      if (!res.ok || !data.id) {
        toast.error(data.error || 'Could not start payment')
        if (data.expired) {
          window.location.reload()
        }
        return
      }

      if (data.already_paid) {
        toast.success('Payment already received. Confirming order…')
        window.location.href = `/checkout/success?order_id=${orderId}`
        return
      }

      setRazorpayOrder({
        id: data.id,
        amount: data.amount,
        currency: data.currency || 'INR',
      })
    } catch {
      toast.error('Could not start payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
      <p className="text-sm text-amber-900 font-medium">
        Payment pending for {orderNumber}
      </p>
      <p className="text-xs text-amber-800">
        Complete payment by {expiresLabel}. After that this order is cancelled
        automatically and stock is released.
      </p>
      {razorpayOrder ? (
        <RazorpayPaymentForm
          orderId={orderId}
          razorpayOrder={razorpayOrder}
          amount={Number((razorpayOrder.amount / 100).toFixed(2))}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="brand"
          loading={loading}
          onClick={startPayment}
        >
          Complete payment · ₹{amount.toFixed(amount % 1 ? 2 : 0)}
        </Button>
      )}
    </div>
  )
}
