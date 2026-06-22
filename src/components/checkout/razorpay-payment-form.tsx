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

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: 'INR',
      order_id: razorpayOrder.id,

      name: 'YadeviLifestyle',
      description: 'Order Payment',

      handler: async function (response: any) {
        setIsVerifying(true)
        try {
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
            useCartStore.getState().clearCart()
            window.location.href = '/dashboard/orders'
          } else {
            toast.error('Verification failed')
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
