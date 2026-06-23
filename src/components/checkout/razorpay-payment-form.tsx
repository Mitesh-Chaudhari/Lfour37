'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useCartStore } from '@/store/cart-store'
import { Button } from '@/components/ui/button'
import { BlockingContainer } from '@/components/ui/blocking-container'

declare global {
  interface Window {
    Razorpay: any
  }
}

export function RazorpayPaymentForm({ razorpayOrder, orderId, amount }: any) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)

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
    if (!isLoaded || !window.Razorpay) {
      toast.error('Payment system loading... please wait')
      return
    }

    if (!razorpayOrder?.id) {
      toast.error('Payment session expired. Please go back and try again.')
      return
    }

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: 'INR',
      order_id: razorpayOrder.id,

      name: 'YadeviLifestyle',
      description: 'Order Payment',

      handler: async function (response: {
        razorpay_payment_id?: string
        razorpay_order_id?: string
        razorpay_signature?: string
      }) {
        setIsVerifying(true)
        try {
          const razorpayOrderId =
            response.razorpay_order_id || razorpayOrder?.id

          if (!response.razorpay_payment_id || !razorpayOrderId) {
            console.error('Incomplete Razorpay handler response', response)
            toast.error(
              'Payment completed but verification data is missing. Please contact support with your payment ID.'
            )
            setIsVerifying(false)
            return
          }

          const res = await fetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: razorpayOrderId,
              ...(response.razorpay_signature
                ? { razorpay_signature: response.razorpay_signature }
                : {}),
              order_id: orderId,
            }),
          })

          const data = await res.json().catch(() => null)

          if (res.ok) {
            toast.success('Payment successful!')
            useCartStore.getState().clearCart()
            window.location.href = '/dashboard/orders'
          } else {
            toast.error(data?.error || 'Verification failed')
            setIsVerifying(false)
          }
        } catch {
          toast.error('Verification error')
          setIsVerifying(false)
        }
      },

      modal: {
        ondismiss: () => {
          setIsVerifying(false)
        },
      },

      prefill: {
        name: '',
        email: '',
        contact: '',
      },

      theme: {
        color: '#c39c41 ',
        backdrop_color: '#1a1a1ad2',
      },
    }

    const rzp = new window.Razorpay(options)
    rzp.open()
  }

  return (
    <BlockingContainer
      busy={isVerifying}
      message="Confirming your payment..."
      className="w-full"
    >
      <Button
        onClick={handlePayment}
        disabled={!isLoaded}
        loading={!isLoaded || isVerifying}
        variant="brand"
        size="lg"
        className="w-full"
      >
        {isVerifying
          ? 'Confirming payment...'
          : isLoaded
            ? `Pay ₹${amount}`
            : 'Loading Payment...'}
      </Button>
    </BlockingContainer>
  )
}
