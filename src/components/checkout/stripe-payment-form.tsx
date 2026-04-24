'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { useCartStore } from '@/store/cart-store'
import { formatPrice } from '@/lib/utils'
import { Shield, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface StripePaymentFormProps {
  clientSecret: string
  orderId: string
  amount: number
}

function PaymentForm({ orderId, amount }: { orderId: string; amount: number }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const { clearCart } = useCartStore()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) return

    setIsLoading(true)

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/success?order_id=${orderId}`,
        },
        redirect: 'if_required',
      })

      if (error) {
        toast.error(error.message || 'Payment failed')
        return
      }

      if (paymentIntent?.status === 'succeeded') {
        // Confirm order on backend
        const res = await fetch('/api/payments/stripe/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_intent_id: paymentIntent.id,
            order_id: orderId,
          }),
        })

        if (!res.ok) {
          toast.error('Payment succeeded but order update failed. Please contact support.')
          return
        }

        clearCart()
        toast.success('Payment successful!')
        router.push(`/checkout/success?order_id=${orderId}`)
      }
    } catch {
      toast.error('Payment failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold">Secure Payment</h3>
      </div>

      <PaymentElement
        options={{
          layout: 'tabs',
          wallets: {
            applePay: 'auto',
            googlePay: 'auto',
          },
        }}
      />

      <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
        <Shield className="h-4 w-4 text-green-600 flex-shrink-0" />
        <span>Your payment is secured by 256-bit SSL encryption</span>
      </div>

      <Button
        type="submit"
        variant="brand"
        size="lg"
        className="w-full"
        loading={isLoading}
        disabled={!stripe || !elements}
      >
        Pay {formatPrice(amount)}
      </Button>
    </form>
  )
}

export function StripePaymentForm({ clientSecret, orderId, amount }: StripePaymentFormProps) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#9333ea',
            colorBackground: '#ffffff',
            colorText: '#111827',
            borderRadius: '8px',
          },
        },
      }}
    >
      <PaymentForm orderId={orderId} amount={amount} />
    </Elements>
  )
}
