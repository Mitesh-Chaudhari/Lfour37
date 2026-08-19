'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Script from 'next/script'

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance
  }
}

type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description: string
  prefill?: { contact?: string; name?: string; email?: string }
  theme?: { color?: string }
  handler: (response: RazorpayResponse) => void
  modal?: { ondismiss?: () => void }
}

type RazorpayInstance = { open: () => void }

type RazorpayResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type OfferState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'expired' }
  | { status: 'declined' }
  | { status: 'accepted' }
  | {
      status: 'ready'
      offerId: string
      razorpayOrderId: string
      discountedTotal: number
      originalTotal: number
      savingsAmount: number
      expiresAt: string
      orderNumber: string
    }

function formatInr(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number>(0)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setRemaining(Math.max(0, ms))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return { remaining, minutes, seconds }
}

export default function CodConvertPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''

  const [offer, setOffer] = useState<OfferState>({ status: 'loading' })
  const [paying, setPaying] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)

  const expiresAt =
    offer.status === 'ready' ? offer.expiresAt : null
  const { remaining, minutes, seconds } = useCountdown(expiresAt)

  // Load offer info from token (calling initiate is idempotent; re-uses existing offer)
  useEffect(() => {
    if (!token) {
      setOffer({ status: 'error', message: 'Invalid payment link.' })
      return
    }

    // Decode orderId from token (payload is base64url before the last dot)
    try {
      const b64 = token.slice(0, token.lastIndexOf('.'))
      const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')))
      if (!payload.orderId || !payload.expiresAt) throw new Error('bad payload')
      if (new Date(payload.expiresAt) < new Date()) {
        setOffer({ status: 'expired' })
        return
      }

      // Fetch offer details from the initiate endpoint (idempotent — returns existing if any)
      fetch('/api/payments/cod-to-prepaid/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: payload.orderId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.success) {
            setOffer({ status: 'error', message: data.error || 'Offer not available.' })
            return
          }
          setOffer({
            status: 'ready',
            offerId: data.offer_id,
            razorpayOrderId: data.razorpay_order_id,
            discountedTotal: data.discounted_total,
            originalTotal: data.original_total,
            savingsAmount: data.savings_amount ?? data.original_total - data.discounted_total,
            expiresAt: data.expires_at,
            orderNumber: data.order_number || '',
          })
        })
        .catch(() =>
          setOffer({ status: 'error', message: 'Failed to load offer. Please try again.' })
        )
    } catch {
      setOffer({ status: 'error', message: 'Invalid payment link.' })
    }
  }, [token])

  // Auto-expire offer when countdown hits 0
  useEffect(() => {
    if (remaining === 0 && offer.status === 'ready') {
      setOffer({ status: 'expired' })
    }
  }, [remaining, offer.status])

  const handlePay = useCallback(() => {
    if (offer.status !== 'ready' || !scriptReady) return
    setPaying(true)

    const rzp = new window.Razorpay({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
      amount: Math.round(offer.discountedTotal * 100),
      currency: 'INR',
      order_id: offer.razorpayOrderId,
      name: 'LFOUR37',
      description: 'Convert to Prepaid — 10% off',
      theme: { color: '#000000' },
      handler: async (response: RazorpayResponse) => {
        try {
          const res = await fetch('/api/payments/cod-to-prepaid/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            }),
          })
          const data = await res.json()
          if (data.success || data.already_converted) {
            setOffer({ status: 'accepted' })
          } else {
            alert(data.error || 'Payment verification failed. Contact support.')
          }
        } catch {
          alert('Payment verification failed. Contact support.')
        } finally {
          setPaying(false)
        }
      },
      modal: {
        ondismiss: () => setPaying(false),
      },
    })
    rzp.open()
  }, [offer, scriptReady, token])

  const handleDecline = useCallback(async () => {
    if (declining) return
    setDeclining(true)
    try {
      await fetch('/api/payments/cod-to-prepaid/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
    } finally {
      setDeclining(false)
      setOffer({ status: 'declined' })
    }
  }, [token, declining])

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onReady={() => setScriptReady(true)}
      />

      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 space-y-6">
          {/* Brand */}
          <div className="text-center">
            <p className="text-xs tracking-[0.25em] uppercase text-gray-400 mb-1">LFOUR37</p>
            <h1 className="text-xl font-bold text-gray-900">Save 10% on Your Order</h1>
          </div>

          {offer.status === 'loading' && (
            <div className="text-center py-8 text-gray-500">Loading offer…</div>
          )}

          {offer.status === 'error' && (
            <div className="text-center space-y-3">
              <p className="text-red-600">{offer.message}</p>
              <button
                onClick={() => router.push('/')}
                className="text-sm underline text-gray-500"
              >
                Go to homepage
              </button>
            </div>
          )}

          {offer.status === 'expired' && (
            <div className="text-center space-y-3">
              <div className="text-4xl">⏰</div>
              <p className="font-semibold text-gray-700">Offer has expired</p>
              <p className="text-sm text-gray-500">
                Your order is confirmed as Cash on Delivery. No changes have been made.
              </p>
            </div>
          )}

          {offer.status === 'declined' && (
            <div className="text-center space-y-3">
              <div className="text-4xl">✅</div>
              <p className="font-semibold text-gray-700">Cash on Delivery confirmed</p>
              <p className="text-sm text-gray-500">
                Your order is confirmed. Our delivery partner will collect the payment at the time of delivery.
              </p>
            </div>
          )}

          {offer.status === 'accepted' && (
            <div className="text-center space-y-3">
              <div className="text-4xl">🎉</div>
              <p className="font-semibold text-gray-700">Payment successful!</p>
              <p className="text-sm text-gray-500">
                Your order has been converted to Prepaid. You saved{' '}
                <strong>{formatInr((offer as { savingsAmount: number }).savingsAmount)}</strong>.
              </p>
            </div>
          )}

          {offer.status === 'ready' && (
            <>
              {/* Order summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Original amount</span>
                  <span className="line-through">{formatInr(offer.originalTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>10% prepaid discount</span>
                  <span className="text-green-600">−{formatInr(offer.savingsAmount)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900 text-base border-t pt-2">
                  <span>You pay</span>
                  <span>{formatInr(offer.discountedTotal)}</span>
                </div>
              </div>

              {/* Countdown */}
              <div className="flex items-center justify-center gap-2 text-orange-600 text-sm font-medium">
                <span>⏳</span>
                <span>
                  Offer expires in{' '}
                  <strong>
                    {minutes}:{String(seconds).padStart(2, '0')}
                  </strong>
                </span>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handlePay}
                  disabled={paying || !scriptReady}
                  className="w-full bg-black text-white rounded-xl py-3 font-semibold text-sm tracking-wide
                             disabled:opacity-50 hover:bg-gray-800 transition-colors"
                >
                  {paying ? 'Opening payment…' : `PAY NOW & SAVE ${formatInr(offer.savingsAmount)}`}
                </button>

                <button
                  onClick={handleDecline}
                  disabled={declining}
                  className="w-full border border-gray-200 text-gray-500 rounded-xl py-3 font-medium text-sm
                             hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {declining ? 'Confirming…' : 'KEEP CASH ON DELIVERY'}
                </button>
              </div>

              <p className="text-xs text-center text-gray-400">
                Your order remains the same — only the payment mode changes. No extra charges.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
