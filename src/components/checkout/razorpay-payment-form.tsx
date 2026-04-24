'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

declare global {
  interface Window {
    Razorpay: any
  }
}

export function RazorpayPaymentForm({ razorpayOrder, orderId, amount }: any) {
  const [isLoaded, setIsLoaded] = useState(false)

  // ✅ Load script properly
  useEffect(() => {
    const loadScript = async () => {
      if (window.Razorpay) {
        setIsLoaded(true)
        return
      }

      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true

      script.onload = () => {
        setIsLoaded(true)
      }

      script.onerror = () => {
        toast.error('Failed to load payment gateway')
      }

      document.body.appendChild(script)
    }

    loadScript()
  }, [])

  const handlePayment = () => {
    // ❌ Prevent crash
    if (!isLoaded || !window.Razorpay) {
      toast.error('Payment system loading... please wait')
      return
    }

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: 'INR',
      order_id: razorpayOrder.id,

      name: 'YadeviLifestyle',
      description: 'Order Payment',

      handler: async function (response: any) {
        try {
          console.log("razorpayOrder FULL before fetch:", razorpayOrder)
          console.log("razorpayOrder.id before fetch:", razorpayOrder?.id)
          const res = await fetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              razorpay_order_id: razorpayOrder?.id || razorpayOrder?.order_id,
              order_id: orderId,
            }),
          })

          if (res.ok) {
            toast.success('Payment successful!')
            window.location.href = '/dashboard/orders'
          } else {
            toast.error('Verification failed')
          }
        } catch {
          toast.error('Verification error')
        }
      },

      prefill: {
        name: '',
        email: '',
        contact: '',
      },

      theme: {
        color: '#7c3aed',
      },
    }

    const rzp = new window.Razorpay(options)
    rzp.open()
  }

  return (
    <button
      onClick={handlePayment}
      disabled={!isLoaded}
      className="w-full bg-purple-600 text-white py-3 rounded-lg disabled:opacity-50"
    >
      {isLoaded ? `Pay ₹${amount}` : 'Loading Payment...'}
    </button>
  )
}