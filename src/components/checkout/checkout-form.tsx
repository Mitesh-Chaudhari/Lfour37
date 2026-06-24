'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreditCard, Tag, MapPin, Truck, Check, Banknote } from 'lucide-react'
import { Address, ShippingMethod } from '@/types'
import { useCartStore } from '@/store/cart-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StripePaymentForm } from '@/components/checkout/stripe-payment-form'
import { CryptoPaymentForm } from '@/components/checkout/crypto-payment-form'
import { checkoutSchema, CheckoutFormData } from '@/lib/validations/checkout'
import { formatPrice, applyCoupon } from '@/lib/utils'
import { Coupon } from '@/types'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { RazorpayPaymentForm } from './razorpay-payment-form'
import { BlockingContainer } from '@/components/ui/blocking-container'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface CheckoutFormProps {
  addresses: Address[]
  shippingMethods: ShippingMethod[]
  user: {
    id: string
    email?: string
    full_name?: string | null
    phone?: string | null
  }
}

export function CheckoutForm({ addresses, shippingMethods, user }: CheckoutFormProps) {
  const router = useRouter()
  const { items, getSubtotal, discountAmount, couponCode, applyCoupon: applyCouponToCart, removeCoupon, setShipping } = useCartStore()
  // const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'crypto'>('stripe')
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay')
  const [couponInput, setCouponInput] = useState('')
  const [couponData, setCouponData] = useState<Coupon | null>(null)
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clientSecret, setClientSecret] = useState<{ id: string; amount: number; currency: string } | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [step, setStep] = useState<'details' | 'payment'>('details')
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    addresses.find((a) => a.is_default)?.id || addresses[0]?.id || null
  )

  const subtotal = getSubtotal()
  const [localDiscount, setLocalDiscount] = useState(discountAmount)

  const freeShippingMethod =
    shippingMethods.find((method) => method.price === 0) || shippingMethods[0]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema) as any,
    defaultValues: {
      country: 'India',
      payment_method: 'razorpay',
      shipping_method_id: freeShippingMethod?.id,
      full_name: user.full_name || '',
      phone: user.phone || '',
    },
  })

  useEffect(() => {
    if (freeShippingMethod?.id) {
      setValue('shipping_method_id', freeShippingMethod.id)
      setShipping(freeShippingMethod.id, 0)
    }
  }, [freeShippingMethod?.id, setShipping, setValue])

  const selectedShippingId = watch('shipping_method_id')
  const shippingAmount = 0

  // Fill form from selected saved address, or profile when entering a new address
  useEffect(() => {
    const addr = addresses.find((a) => a.id === selectedAddressId)
    if (addr) {
      setValue('full_name', addr.full_name)
      setValue('phone', addr.phone)
      setValue('address_line1', addr.address_line1)
      setValue('address_line2', addr.address_line2 || '')
      setValue('city', addr.city)
      setValue('state', addr.state)
      setValue('postal_code', addr.postal_code)
      setValue('country', addr.country)
      return
    }

    if (user.full_name) setValue('full_name', user.full_name)
    if (user.phone) setValue('phone', user.phone)
  }, [selectedAddressId, addresses, user.full_name, user.phone, setValue])

  const afterDiscount = Math.max(0, subtotal - localDiscount)
  const taxAmount = 0
  const total = afterDiscount + taxAmount + shippingAmount

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    setIsApplyingCoupon(true)
    try {
      const res = await fetch(`/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput.toUpperCase(), subtotal }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Invalid coupon')
        return
      }
      const discount = applyCoupon(subtotal, data.coupon)
      setCouponData(data.coupon)
      setLocalDiscount(discount)
      applyCouponToCart(couponInput.toUpperCase(), discount)
      toast.success(`Coupon applied! You save ${formatPrice(discount)}`)
    } catch {
      toast.error('Failed to apply coupon')
    } finally {
      setIsApplyingCoupon(false)
    }
  }

  const handleRemoveCoupon = () => {
    setCouponData(null)
    setLocalDiscount(0)
    setCouponInput('')
    removeCoupon()
    toast.success('Coupon removed')
  }

  const onSubmitDetails = async (data: CheckoutFormData) => {
    if (items.length === 0) {
      toast.error('Your cart is empty')
      return
    }

    setIsSubmitting(true)
    try {
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id,
            quantity: i.quantity,
            unit_price: i.product.price + i.variant.price_modifier,
          })),
          shipping_address: {
            full_name: data.full_name,
            phone: data.phone,
            address_line1: data.address_line1,
            address_line2: data.address_line2,
            city: data.city,
            state: data.state,
            postal_code: data.postal_code,
            country: data.country,
          },
          shipping_method_id: data.shipping_method_id,
          coupon_code: couponCode,
          discount_amount: localDiscount,
          payment_method: paymentMethod,
          save_address: data.save_address,
        }),
      })

      if (!orderRes.ok) {
        const err = await orderRes.json()
        console.error('Order error:', JSON.stringify(err, null, 2))
        const detail = err.details?.[0]
          ? `${err.details[0].path?.join('.')}: ${err.details[0].message}`
          : err.error
        toast.error(detail || 'Failed to create order')
        return
      }

      const { order_id } = await orderRes.json()
      setOrderId(order_id)

      if (paymentMethod === 'cod') {
        const confirmRes = await fetch('/api/payments/cod/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id }),
        })
        const confirmData = await confirmRes.json()

        if (!confirmRes.ok) {
          toast.error(confirmData.error || 'Failed to place COD order')
          return
        }

        if (confirmData.shipment && !confirmData.shipment.ok) {
          toast.error(
            confirmData.shipment.error ||
              'Order placed, but shipment could not be created yet.'
          )
        } else {
          toast.success('Order placed! Pay when your package arrives.')
        }

        router.push('/dashboard/orders')
        return
      }

      if (paymentMethod === 'razorpay') {
        const paymentRes = await fetch('/api/payments/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id }),
        })

        const data = await paymentRes.json()

        if (!paymentRes.ok || !data.id) {
          toast.error(data.error || 'Failed to initialize payment')
          return
        }

        const normalizedOrder = {
          id: data.id,
          amount: data.amount,
          currency: data.currency,
        }

        setClientSecret(normalizedOrder as { id: string; amount: number; currency: string })
      }

      setStep('payment')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Your cart is empty.</p>
        <Button asChild className="mt-4"><a href="/products">Continue Shopping</a></Button>
      </div>
    )
  }

  return (
    <BlockingContainer
      busy={isSubmitting}
      message={
        paymentMethod === 'cod'
          ? 'Placing your order...'
          : 'Preparing payment...'
      }
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      {/* Left: Form */}
      <div className="lg:col-span-2 space-y-6">
        {step === 'details' ? (
          <form onSubmit={handleSubmit(onSubmitDetails)} className="space-y-6">
            {/* Saved addresses */}
            {addresses.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-5 w-5 text-purple-600" />
                  <h2 className="text-lg font-semibold">Saved Addresses</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {addresses.map((addr) => (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={cn(
                        'text-left p-3 rounded-lg border-2 transition-all',
                        selectedAddressId === addr.id
                          ? 'border-purple-600 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300'
                      )}
                    >
                      <p className="font-medium text-sm text-gray-900">{addr.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {addr.address_line1}, {addr.city}, {addr.state} {addr.postal_code}
                      </p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAddressId(null)}
                  className="text-sm text-purple-600 hover:underline"
                >
                  + Use a different address
                </button>
              </div>
            )}

            {/* Shipping address form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">Shipping Address</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Full Name" error={errors.full_name?.message} {...register('full_name')} />
                <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
                <div className="sm:col-span-2">
                  <Input label="Address Line 1" error={errors.address_line1?.message} {...register('address_line1')} />
                </div>
                <div className="sm:col-span-2">
                  <Input label="Address Line 2 (optional)" {...register('address_line2')} />
                </div>
                <Input label="City" error={errors.city?.message} {...register('city')} />
                <Input label="State" error={errors.state?.message} {...register('state')} />
                <Input label="Postal Code" error={errors.postal_code?.message} {...register('postal_code')} />
                <Input label="Country" defaultValue="India" {...register('country')} />
              </div>

              {!selectedAddressId && (
                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input type="checkbox" className="accent-primary-600" {...register('save_address')} />
                  <span className="text-sm text-gray-700">Save this address for future orders</span>
                </label>
              )}
            </div>

            {/* Shipping method */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="h-5 w-5 text-purple-600" />
                <h2 className="text-lg font-semibold">Shipping Method</h2>
              </div>
              {freeShippingMethod ? (
                <div className="flex items-center justify-between p-4 rounded-xl border-2 border-purple-600 bg-purple-50">
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      {freeShippingMethod.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {freeShippingMethod.description ||
                        `${freeShippingMethod.estimated_days_min}-${freeShippingMethod.estimated_days_max} business days`}
                    </p>
                  </div>
                  <span className="font-semibold text-sm text-green-600">Free</span>
                </div>
              ) : (
                <p className="text-sm text-red-600">
                  Free shipping is not available right now.
                </p>
              )}
              <input
                type="hidden"
                value={freeShippingMethod?.id || ''}
                {...register('shipping_method_id')}
              />
              {errors.shipping_method_id && (
                <p className="text-xs text-red-500 mt-1">{errors.shipping_method_id.message}</p>
              )}
            </div>

            {/* Payment method selection */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('razorpay')
                    setValue('payment_method', 'razorpay')
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all',
                    paymentMethod === 'razorpay'
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  )}
                >
                  <CreditCard className={cn('h-5 w-5', paymentMethod === 'razorpay' ? 'text-purple-600' : 'text-gray-500')} />
                  <div className="text-left">
                    <p className="font-medium text-sm text-gray-900">Card / Wallet</p>
                    <p className="text-xs text-gray-500">Visa, PhonePe, Google Pay</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('cod')
                    setValue('payment_method', 'cod')
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all',
                    paymentMethod === 'cod'
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  )}
                >
                  <Banknote className={cn('h-5 w-5', paymentMethod === 'cod' ? 'text-purple-600' : 'text-gray-500')} />
                  <div className="text-left">
                    <p className="font-medium text-sm text-gray-900">Cash on Delivery</p>
                    <p className="text-xs text-gray-500">Pay when your order arrives</p>
                  </div>
                </button>
              </div>
              <input type="hidden" value={paymentMethod} {...register('payment_method')} />
            </div>

            <Button
              type="submit"
              variant="brand"
              size="lg"
              className="w-full"
              loading={isSubmitting}
            >
              {paymentMethod === 'cod' ? 'Place Order' : 'Continue to Payment'}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {/* {paymentMethod === 'stripe' && clientSecret && orderId ? (
                <StripePaymentForm
                  clientSecret={clientSecret}
                  orderId={orderId}
                  amount={total}
                />
              ) : paymentMethod === 'crypto' && orderId ? (
                <CryptoPaymentForm orderId={orderId} amount={total} />
              ) : null} */}
              {paymentMethod === 'razorpay' && clientSecret && orderId && (
                <RazorpayPaymentForm
                  orderId={orderId}
                  razorpayOrder={clientSecret}
                  amount={total}
                />
              )}
            </div>
            <button
              onClick={() => setStep('details')}
              className="text-sm text-gray-600 hover:text-purple-600 transition-colors"
            >
              ← Back to Details
            </button>
          </div>
        )}
      </div>

      {/* Right: Order summary */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

          {/* Items */}
          <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="relative h-14 w-11 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  {item.variant.image_url && (
                    <OptimizedImage
                      src={item.variant.image_url}
                      alt={item.product.name}
                      fill
                      variant="thumbnail"
                      className="object-cover"
                    />
                  )}
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-purple-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {item.quantity}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-500">{item.variant.size} / {item.variant.color}</p>
                </div>
                <p className="text-xs font-bold text-gray-900">
                  {formatPrice((item.product.price + item.variant.price_modifier) * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          {/* Coupon */}
          {!couponData ? (
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Coupon code"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <Button size="sm" variant="outline" onClick={handleApplyCoupon} loading={isApplyingCoupon}>
                Apply
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">{couponData.code}</span>
              </div>
              <button onClick={handleRemoveCoupon} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          )}

          {/* Totals */}
          <div className="space-y-2 text-sm border-t pt-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {localDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatPrice(localDiscount)}</span>
              </div>
            )}
            {/* <div className="flex justify-between">
              <span className="text-gray-600">Tax (5%)</span>
              <span>{formatPrice(taxAmount)}</span>
            </div> */}
            <div className="flex justify-between">
              <span className="text-gray-600">Shipping</span>
              <span>{shippingAmount === 0 ? <span className="text-green-600">Free</span> : formatPrice(shippingAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </BlockingContainer>
  )
}
