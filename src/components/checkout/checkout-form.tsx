'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CreditCard,
  Tag,
  MapPin,
  Truck,
  Check,
  Banknote,
  User,
  Mail,
  Loader2,
} from 'lucide-react'
import { Address, ShippingMethod } from '@/types'
import { useCartStore } from '@/store/cart-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { checkoutSchema, guestCheckoutFormSchema, CheckoutFormData } from '@/lib/validations/checkout'
import { formatPrice, applyCoupon } from '@/lib/utils'
import { Coupon } from '@/types'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { RazorpayPaymentForm } from './razorpay-payment-form'
import { BlockingContainer } from '@/components/ui/blocking-container'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { getAttributionForCheckout } from '@/lib/attribution'
import { createClient } from '@/lib/supabase/client'
import { buildAuthHref } from '@/lib/auth-redirect'
import { usePincodeLookup } from '@/hooks/use-pincode-lookup'
import {
  calculatePrepaidDiscount,
  PREPAID_DISCOUNT_LABEL,
} from '@/lib/prepaid-discount'

interface CheckoutFormProps {
  addresses: Address[]
  shippingMethods: ShippingMethod[]
  user: {
    id: string
    email?: string
    full_name?: string | null
    phone?: string | null
  } | null
}

export function CheckoutForm({
  addresses,
  shippingMethods,
  user,
}: CheckoutFormProps) {
  const router = useRouter()
  const isGuest = !user
  const supabase = createClient()
  const {
    items,
    getSubtotal,
    discountAmount,
    couponCode,
    applyCoupon: applyCouponToCart,
    removeCoupon,
    setShipping,
    clearCart,
  } = useCartStore()
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>(
    'razorpay'
  )
  const [couponInput, setCouponInput] = useState('')
  const [couponData, setCouponData] = useState<Coupon | null>(null)
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clientSecret, setClientSecret] = useState<{
    id: string
    amount: number
    currency: string
  } | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [step, setStep] = useState<'details' | 'payment'>('details')
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    addresses.find((a) => a.is_default)?.id || addresses[0]?.id || null
  )

  const [phoneVerified, setPhoneVerified] = useState(false)
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [isSendOtpClicked, setIsSendOtpClicked] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [reclaimChannel, setReclaimChannel] = useState<'phone' | 'email' | null>(
    null
  )
  const [reclaimPhoneHint, setReclaimPhoneHint] = useState<string | null>(null)
  const [accountReclaimed, setAccountReclaimed] = useState(false)
  const [guestAddresses, setGuestAddresses] = useState<Address[]>([])
  const [emailLocked, setEmailLocked] = useState(false)
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
    resolver: zodResolver(
      (isGuest ? guestCheckoutFormSchema : checkoutSchema) as any
    ) as any,
    defaultValues: {
      country: 'India',
      payment_method: 'razorpay',
      shipping_method_id: freeShippingMethod?.id,
      full_name: user?.full_name || '',
      phone: user?.phone || '',
      email: user?.email || '',
    },
  })

  useEffect(() => {
    if (freeShippingMethod?.id) {
      setValue('shipping_method_id', freeShippingMethod.id)
      setShipping(freeShippingMethod.id, 0)
    }
  }, [freeShippingMethod?.id, setShipping, setValue])

  const shippingAmount = 0
  const guestEmail = watch('email')
  const guestPhone = watch('phone')
  const isValidPhone = /^[0-9]{10}$/.test(guestPhone || '')
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail || '')

  const postalCode = watch('postal_code')
  const cityValue = watch('city')
  const stateValue = watch('state')

  const { status: pinStatus, data: pinData } = usePincodeLookup(
    postalCode,
    (data) => {
      const savedPool = accountReclaimed ? guestAddresses : addresses
      const savedAddr =
        (!isGuest || accountReclaimed) && selectedAddressId
          ? savedPool.find((a) => a.id === selectedAddressId)
          : undefined
      if (savedAddr && savedAddr.postal_code.trim() === (postalCode || '').trim()) {
        return
      }

      if (data.city) setValue('city', data.city, { shouldValidate: true })
      if (data.state) setValue('state', data.state, { shouldValidate: true })
      setValue('country', 'India')
    }
  )

  // City/State stay locked until the PIN lookup fills them (or fails, allowing manual entry)
  const cityStateLocked =
    !cityValue &&
    !stateValue &&
    (pinStatus === 'idle' || pinStatus === 'loading')

  const codUnavailable = pinData?.codAvailable === false

  // Fill form from selected saved address, or profile when entering a new address
  useEffect(() => {
    if (isGuest) return

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

    if (user?.full_name) setValue('full_name', user.full_name)
    if (user?.phone) setValue('phone', user.phone)
  }, [
    selectedAddressId,
    addresses,
    user?.full_name,
    user?.phone,
    setValue,
    isGuest,
  ])

  // COD isn't offered by DTDC on every PIN code (B2C COD serviceability)
  useEffect(() => {
    if (codUnavailable && paymentMethod === 'cod') {
      setPaymentMethod('razorpay')
      setValue('payment_method', 'razorpay')
      toast.error(
        'Cash on Delivery is not available for this PIN. Please pay online.'
      )
    }
  }, [codUnavailable, paymentMethod, setValue])

  // Guest phone change invalidates OTP verification (new-email path only)
  useEffect(() => {
    if (!isGuest || emailExists || accountReclaimed) return

    if (verifiedPhone && verifiedPhone !== guestPhone) {
      setPhoneVerified(false)
      setVerifiedPhone('')
      setIsSendOtpClicked(false)
      setOtp('')
    }
  }, [guestPhone, isGuest, verifiedPhone, emailExists, accountReclaimed])

  useEffect(() => {
    if (!isGuest || !isValidPhone || !guestPhone || emailExists) return

    const checkPhoneVerification = async (phone: string) => {
      try {
        const res = await fetch('/api/auth/check-phone-verified', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })
        const data = await res.json()
        if (data.verified) {
          setPhoneVerified(true)
          setVerifiedPhone(phone)
        }
      } catch {
        // ignore
      }
    }

    checkPhoneVerification(guestPhone)
  }, [guestPhone, isGuest, isValidPhone, emailExists])

  useEffect(() => {
    if (!isGuest) return

    if (!guestEmail || !isValidEmail) {
      setEmailExists(false)
      setReclaimChannel(null)
      setReclaimPhoneHint(null)
      return
    }

    if (emailLocked && accountReclaimed) return

    const timeout = setTimeout(async () => {
      try {
        setCheckingEmail(true)
        const res = await fetch('/api/auth/guest-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: guestEmail }),
        })
        const data = await res.json()
        const exists = Boolean(data.exists)
        setEmailExists(exists)

        if (exists) {
          setReclaimChannel(data.channel === 'email' ? 'email' : 'phone')
          setReclaimPhoneHint(data.phone_hint || null)
          // Existing account must use reclaim OTP — clear new-user phone verify
          setPhoneVerified(false)
          setVerifiedPhone('')
          setIsSendOtpClicked(false)
          setOtp('')
          setAccountReclaimed(false)
          if (data.full_name) {
            setValue('full_name', data.full_name)
          }
          const savedPhone = String(data.phone || '')
            .replace(/\D/g, '')
            .slice(-10)
          if (savedPhone.length === 10) {
            setValue('phone', savedPhone, { shouldValidate: true })
          }
        } else {
          setReclaimChannel(null)
          setReclaimPhoneHint(null)
        }
      } catch {
        setEmailExists(false)
        setReclaimChannel(null)
        setReclaimPhoneHint(null)
      } finally {
        setCheckingEmail(false)
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [guestEmail, isGuest, isValidEmail, emailLocked, accountReclaimed, setValue])

  // Prefill from reclaimed saved address
  useEffect(() => {
    if (!accountReclaimed || !guestAddresses.length) return

    const addr =
      guestAddresses.find((a) => a.id === selectedAddressId) ||
      guestAddresses[0]
    if (!addr) return

    setValue('full_name', addr.full_name)
    const addrPhone = (addr.phone || '').replace(/\D/g, '').slice(-10)
    // Keep verified account phone if address has none; otherwise use address phone
    if (addrPhone.length === 10) {
      setValue('phone', addrPhone)
      if (phoneVerified && verifiedPhone && verifiedPhone !== addrPhone) {
        // Delivery phone changed from verified account phone — require re-verify
        setPhoneVerified(false)
        setVerifiedPhone('')
        setIsSendOtpClicked(false)
      }
    }
    setValue('address_line1', addr.address_line1)
    setValue('address_line2', addr.address_line2 || '')
    setValue('city', addr.city)
    setValue('state', addr.state)
    setValue('postal_code', addr.postal_code)
    setValue('country', addr.country)
  }, [
    selectedAddressId,
    guestAddresses,
    accountReclaimed,
    setValue,
    phoneVerified,
    verifiedPhone,
  ])

  const afterCoupon = Math.max(0, subtotal - localDiscount)
  const prepaidDiscount = calculatePrepaidDiscount(afterCoupon, paymentMethod)
  // What the shopper would save by switching from COD to prepaid
  const potentialPrepaidSavings = calculatePrepaidDiscount(afterCoupon, 'razorpay')
  const taxAmount = 0
  const productTotal = Math.max(0, afterCoupon - prepaidDiscount) + taxAmount
  const total = productTotal + shippingAmount
  const payNowAmount = total

  const sendOtp = async () => {
    // Existing account not yet reclaimed → OTP to on-file phone/email
    if (emailExists && !accountReclaimed) {
      if (!guestEmail || !isValidEmail) {
        toast.error('Enter a valid email first')
        return
      }

      setSendingOtp(true)
      try {
        const res = await fetch('/api/auth/send-guest-reclaim-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: guestEmail }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Failed to send OTP')
          return
        }
        setReclaimChannel(data.channel === 'email' ? 'email' : 'phone')
        setReclaimPhoneHint(data.phone_hint || reclaimPhoneHint)
        setIsSendOtpClicked(true)
        toast.success(
          data.channel === 'email'
            ? 'OTP sent to your email'
            : `OTP sent on WhatsApp to ${data.phone_hint || 'your saved number'}`
        )
      } catch {
        toast.error('Failed to send OTP')
      } finally {
        setSendingOtp(false)
      }
      return
    }

    // New guest, or reclaimed account still missing a phone
    if (!isValidPhone) {
      toast.error('Please enter a valid 10 digit phone number')
      return
    }

    setSendingOtp(true)
    try {
      const res = await fetch('/api/auth/send-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: guestPhone }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to send OTP')
        return
      }
      setIsSendOtpClicked(true)
      toast.success('OTP sent to your WhatsApp')
    } catch {
      toast.error('Failed to send OTP')
    } finally {
      setSendingOtp(false)
    }
  }

  const verifyOtp = async () => {
    if (!otp.trim()) {
      toast.error('Enter the OTP')
      return
    }

    setVerifyingOtp(true)
    try {
      if (emailExists && !accountReclaimed) {
        const channel = reclaimChannel || 'phone'
        const res = await fetch('/api/auth/guest-reclaim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: guestEmail,
            otp: otp.trim(),
            channel,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Invalid OTP')
          return
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })

        if (sessionError) {
          toast.error('Verified, but sign-in failed. Please try again.')
          return
        }

        if (data.profile?.full_name) {
          setValue('full_name', data.profile.full_name)
        }

        const addrs = (data.addresses || []) as Address[]
        setGuestAddresses(addrs)
        if (addrs.length) {
          const defaultAddr =
            addrs.find((a) => a.is_default) || addrs[0]
          setSelectedAddressId(defaultAddr.id)
        }

        let resolvedPhone = (
          data.profile?.phone ||
          addrs.find((a) => (a.phone || '').replace(/\D/g, '').length >= 10)
            ?.phone ||
          ''
        )
          .replace(/\D/g, '')
          .slice(-10)

        // After session is set, re-read profile in case phone was missed
        if (resolvedPhone.length !== 10) {
          try {
            const { data: profileRow } = await supabase
              .from('users')
              .select('phone, phone_verified')
              .eq('id', data.profile?.id)
              .maybeSingle()
            const fromDb = (profileRow?.phone || '')
              .replace(/\D/g, '')
              .slice(-10)
            if (fromDb.length === 10) {
              resolvedPhone = fromDb
              if (profileRow?.phone_verified) {
                data.profile = {
                  ...data.profile,
                  phone: fromDb,
                  phone_verified: true,
                }
              }
            }
          } catch {
            // ignore
          }
        }

        setAccountReclaimed(true)
        setEmailLocked(true)
        setOtp('')
        setIsSendOtpClicked(false)

        if (resolvedPhone.length === 10) {
          setValue('phone', resolvedPhone, { shouldValidate: true })
          const alreadyVerified =
            Boolean(data.profile?.phone_verified) ||
            data.requires_phone_otp === false
          if (alreadyVerified) {
            setVerifiedPhone(resolvedPhone)
            setPhoneVerified(true)
            toast.success('Welcome back — account and phone verified')
          } else {
            setVerifiedPhone('')
            setPhoneVerified(false)
            toast.success(
              'Account verified. Confirm your phone via WhatsApp OTP to continue.'
            )
          }
        } else {
          setValue('phone', '')
          setVerifiedPhone('')
          setPhoneVerified(false)
          toast.success(
            'Account verified. Please add and verify your phone for WhatsApp updates.'
          )
        }
        return
      }

      // New guest phone OTP, or reclaimed account that still needs a phone
      const res = await fetch('/api/auth/verify-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: guestPhone, otp: otp.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Invalid OTP')
        return
      }
      setPhoneVerified(true)
      setVerifiedPhone(guestPhone || '')

      if (accountReclaimed && guestPhone) {
        try {
          await fetch('/api/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: watch('full_name') || 'Customer',
              phone: guestPhone,
            }),
          })
        } catch {
          // Order can still use shipping phone; profile sync is best-effort
        }
      }

      toast.success('Phone verified')
    } catch {
      toast.error('Failed to verify OTP')
    } finally {
      setVerifyingOtp(false)
    }
  }

  const ensureGuestSession = async (data: CheckoutFormData) => {
    if (!isGuest) return true

    if (!data.email) {
      toast.error('Email is required')
      return false
    }

    if (!data.phone || !/^[0-9]{10}$/.test(data.phone)) {
      toast.error('A valid 10-digit phone number is required for WhatsApp updates')
      return false
    }

    if (emailExists) {
      if (!accountReclaimed) {
        toast.error('Please verify the OTP sent to your saved phone or email')
        return false
      }

      if (!phoneVerified || verifiedPhone !== data.phone) {
        toast.error('Please verify your phone number for WhatsApp updates')
        return false
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) return true
      toast.error('Session expired. Please verify OTP again.')
      setAccountReclaimed(false)
      setPhoneVerified(false)
      return false
    }

    if (!phoneVerified || verifiedPhone !== data.phone) {
      toast.error('Please verify your phone number')
      return false
    }

    const res = await fetch('/api/auth/guest-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      if (result.code === 'EMAIL_EXISTS') {
        setEmailExists(true)
        setReclaimChannel('phone')
        toast.error(
          result.error ||
            'An account with this email already exists. Verify with OTP to continue.'
        )
      } else {
        toast.error(result.error || 'Failed to create account')
      }
      return false
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    })

    if (sessionError) {
      toast.error(
        'Account created but sign-in failed. Please use the set-password link from your email.'
      )
      return false
    }

    return true
  }

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

    if (pinStatus === 'unserviceable') {
      toast.error(
        pinData?.remarks?.toLowerCase().includes('embargo')
          ? 'This PIN is temporarily under Delhivery Embargo. Please try again after 24 hours or use another address.'
          : 'Sorry, we cannot deliver to this PIN code yet. Please use a different address.'
      )
      return
    }

    if (paymentMethod === 'cod' && codUnavailable) {
      toast.error(
        'Cash on Delivery is not available for this PIN. Please pay online.'
      )
      return
    }

    setIsSubmitting(true)
    try {
      const sessionReady = await ensureGuestSession(data)
      if (!sessionReady) return

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
          save_address: isGuest ? true : data.save_address,
          attribution: getAttributionForCheckout(),
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
          toast.error(confirmData.error || 'Failed to confirm COD order')
          return
        }

        setOrderPlaced(true)
        clearCart()
        router.push(`/checkout/success?order_id=${order_id}`)
        router.refresh()
        return
      }

      const paymentRes = await fetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id }),
      })
      const paymentData = await paymentRes.json()

      if (!paymentRes.ok || !paymentData.id) {
        toast.error(paymentData.error || 'Failed to initialize payment')
        return
      }

      setClientSecret({
        id: paymentData.id,
        amount: paymentData.amount,
        currency: paymentData.currency,
      })
      setStep('payment')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Skip the empty-cart screen right after placing an order (cart is cleared
  // while we navigate to the success page) and during the payment step
  if (items.length === 0 && !orderPlaced && step === 'details') {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Your cart is empty.</p>
        <Button asChild className="mt-4">
          <a href="/products">Continue Shopping</a>
        </Button>
      </div>
    )
  }

  return (
    <BlockingContainer
      busy={isSubmitting}
      message={
        paymentMethod === 'cod'
          ? 'Confirming your COD order...'
          : 'Preparing payment...'
      }
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      <div className="lg:col-span-2 space-y-6">
        {step === 'details' ? (
          <form onSubmit={handleSubmit(onSubmitDetails)} className="space-y-6">
            {isGuest && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-5 w-5 text-purple-600" />
                  <h2 className="text-lg font-semibold">Contact details</h2>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  We&apos;ll create your account so you can track this order.
                  Already have an account?{' '}
                  <Link
                    href={buildAuthHref('/login', '/checkout')}
                    className="text-purple-600 hover:underline font-medium"
                  >
                    Sign in
                  </Link>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Input
                      label="Full Name"
                      error={errors.full_name?.message}
                      {...register('full_name')}
                    />
                  </div>

                  {/* Email + email OTP only */}
                  <div className="sm:col-span-2">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                      <div className="flex-1">
                        <Input
                          label="Email"
                          type="email"
                          leftIcon={<Mail className="h-4 w-4" />}
                          error={errors.email?.message}
                          disabled={emailLocked}
                          {...register('email')}
                        />
                      </div>
                      {emailExists &&
                        !accountReclaimed &&
                        reclaimChannel === 'email' && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={sendOtp}
                            loading={sendingOtp}
                            disabled={!isValidEmail}
                            className="sm:mb-0 shrink-0"
                          >
                            {isSendOtpClicked ? 'Resend email OTP' : 'Send email OTP'}
                          </Button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Order updates and your set-password link go to this address.
                    </p>
                    {checkingEmail && (
                      <p className="text-xs text-gray-400 mt-1">
                        Checking email...
                      </p>
                    )}
                    {emailExists && !accountReclaimed && (
                      <p className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                        Account found.{' '}
                        {reclaimChannel === 'email'
                          ? 'Verify with email OTP to continue.'
                          : `Verify with WhatsApp OTP${
                              reclaimPhoneHint ? ` (${reclaimPhoneHint})` : ''
                            } on the phone field below.`}{' '}
                        Prefer password?{' '}
                        <Link
                          href={buildAuthHref('/login', '/checkout')}
                          className="underline font-medium"
                        >
                          Sign in
                        </Link>
                        .
                      </p>
                    )}
                    {emailExists &&
                      !accountReclaimed &&
                      reclaimChannel === 'email' &&
                      isSendOtpClicked && (
                        <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-end">
                          <div className="flex-1">
                            <Input
                              label="Email OTP"
                              inputMode="numeric"
                              maxLength={6}
                              value={otp}
                              onChange={(e) => setOtp(e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={verifyOtp}
                            loading={verifyingOtp}
                            className="sm:mb-0"
                          >
                            Verify email OTP
                          </Button>
                        </div>
                      )}
                    {accountReclaimed && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Account verified —
                        signed in to continue checkout
                      </p>
                    )}
                    {accountReclaimed && !phoneVerified && (
                      <p className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                        Add your phone and verify via WhatsApp so order updates
                        can be sent.
                      </p>
                    )}
                  </div>

                  {/* Phone + WhatsApp OTP only */}
                  <div className="sm:col-span-2">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                      <div className="flex-1">
                        <Input
                          label="Phone"
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          error={errors.phone?.message}
                          disabled={Boolean(phoneVerified && verifiedPhone)}
                          {...register('phone')}
                        />
                      </div>
                      {(emailExists &&
                        !accountReclaimed &&
                        reclaimChannel === 'phone') ||
                      ((!emailExists || accountReclaimed) &&
                        !phoneVerified) ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={sendOtp}
                          loading={sendingOtp}
                          disabled={
                            phoneVerified ||
                            (emailExists &&
                            !accountReclaimed &&
                            reclaimChannel === 'phone'
                              ? !isValidEmail
                              : !isValidPhone)
                          }
                          className="sm:mb-0 shrink-0"
                        >
                          {phoneVerified
                            ? 'Verified'
                            : isSendOtpClicked
                              ? 'Resend WhatsApp OTP'
                              : 'Send WhatsApp OTP'}
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {emailExists &&
                      !accountReclaimed &&
                      reclaimChannel === 'phone'
                        ? `Saved number filled from your account${
                            reclaimPhoneHint ? ` (${reclaimPhoneHint})` : ''
                          }. Verify with WhatsApp OTP to continue.`
                        : accountReclaimed && !phoneVerified
                          ? 'Enter your phone and verify via WhatsApp for order updates.'
                          : emailExists &&
                              !accountReclaimed &&
                              reclaimChannel === 'email'
                            ? 'After email verification, phone is still required for WhatsApp updates.'
                            : "We'll send a verification code on WhatsApp."}
                    </p>

                    {((emailExists &&
                      !accountReclaimed &&
                      reclaimChannel === 'phone') ||
                      ((!emailExists || accountReclaimed) &&
                        !phoneVerified)) &&
                      isSendOtpClicked && (
                        <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-end">
                          <div className="flex-1">
                            <Input
                              label="WhatsApp OTP"
                              inputMode="numeric"
                              maxLength={6}
                              value={otp}
                              onChange={(e) => setOtp(e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={verifyOtp}
                            loading={verifyingOtp}
                            className="sm:mb-0"
                          >
                            Verify WhatsApp OTP
                          </Button>
                        </div>
                      )}
                  </div>

                  {phoneVerified && (
                    <p className="sm:col-span-2 text-sm text-green-600 flex items-center gap-1">
                      <Check className="h-4 w-4" /> Phone ready for WhatsApp
                      updates
                    </p>
                  )}
                </div>
              </div>
            )}

            {((!isGuest && addresses.length > 0) ||
              (accountReclaimed && guestAddresses.length > 0)) && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-5 w-5 text-purple-600" />
                  <h2 className="text-lg font-semibold">Saved Addresses</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {(accountReclaimed ? guestAddresses : addresses).map(
                    (addr) => (
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
                      <p className="font-medium text-sm text-gray-900">
                        {addr.full_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {addr.address_line1}, {addr.city}, {addr.state}{' '}
                        {addr.postal_code}
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

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">Shipping Address</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!isGuest && (
                  <>
                    <Input
                      label="Full Name"
                      error={errors.full_name?.message}
                      {...register('full_name')}
                    />
                    <Input
                      label="Phone"
                      type="tel"
                      error={errors.phone?.message}
                      {...register('phone')}
                    />
                    
                  </>
                )}
                <div className="sm:col-span-2">
                  <Input
                    label="Address Line 1"
                    error={errors.address_line1?.message}
                    {...register('address_line1')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Address Line 2 (optional)"
                    {...register('address_line2')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="PIN Code"
                    inputMode="numeric"
                    maxLength={6}
                    error={
                      errors.postal_code?.message ||
                      (pinStatus === 'unserviceable'
                        ? pinData?.remarks?.toLowerCase().includes('embargo')
                          ? 'This PIN is temporarily under Delhivery Embargo. Please try again after 24 hours or use another address.'
                          : 'Sorry, delivery is not available to this PIN code'
                        : undefined)
                    }
                    helperText={
                      pinStatus === 'loading'
                        ? 'Finding your city & state...'
                        : pinStatus === 'success'
                          ? 'City & state auto-filled — you can edit them if needed'
                          : pinStatus === 'error'
                            ? "Couldn't auto-fill from this PIN code — please enter city & state manually"
                            : 'Enter your 6-digit PIN code to auto-fill city & state'
                    }
                    rightIcon={
                      pinStatus === 'loading' ? (
                        <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                      ) : pinStatus === 'success' ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : undefined
                    }
                    {...register('postal_code')}
                  />
                </div>
                <Input
                  label="City"
                  disabled={cityStateLocked}
                  placeholder={cityStateLocked ? 'Auto-filled from PIN code' : undefined}
                  error={errors.city?.message}
                  {...register('city')}
                />
                <Input
                  label="State"
                  disabled={cityStateLocked}
                  placeholder={cityStateLocked ? 'Auto-filled from PIN code' : undefined}
                  error={errors.state?.message}
                  {...register('state')}
                />
                <Input
                  label="Country"
                  defaultValue="India"
                  {...register('country')}
                />
              </div>

              {!isGuest && !selectedAddressId && (
                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-primary-600"
                    {...register('save_address')}
                  />
                  <span className="text-sm text-gray-700">
                    Save this address for future orders
                  </span>
                </label>
              )}
            </div>

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
                  <span className="font-semibold text-sm text-green-600">
                    Free
                  </span>
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
                <p className="text-xs text-red-500 mt-1">
                  {errors.shipping_method_id.message}
                </p>
              )}
            </div>

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
                    'relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all',
                    paymentMethod === 'razorpay'
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  )}
                >
                  <span className="absolute -top-2.5 right-3 bg-black text-[#c39c41] text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full">
                    EXTRA 5% OFF
                  </span>
                  <CreditCard
                    className={cn(
                      'h-5 w-5',
                      paymentMethod === 'razorpay'
                        ? 'text-purple-600'
                        : 'text-gray-500'
                    )}
                  />
                  <div className="text-left">
                    <p className="font-medium text-sm text-gray-900">
                      Card / Wallet
                    </p>
                    <p className="text-xs text-gray-500">
                      Visa, PhonePe, Google Pay
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={codUnavailable}
                  onClick={() => {
                    setPaymentMethod('cod')
                    setValue('payment_method', 'cod')
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all text-left',
                    paymentMethod === 'cod'
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300',
                    codUnavailable &&
                      'opacity-50 cursor-not-allowed hover:border-gray-200'
                  )}
                >
                  <Banknote
                    className={cn(
                      'h-5 w-5 shrink-0',
                      paymentMethod === 'cod'
                        ? 'text-purple-600'
                        : 'text-gray-500'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900">
                      Cash on Delivery
                    </p>
                    <p className="text-xs text-gray-500">
                      {codUnavailable
                        ? 'Not available for this PIN code'
                        : `Pay ${formatPrice(productTotal)} on delivery`}
                    </p>
                    {/* {!codUnavailable && (
                      <p className="mt-1 text-[11px] font-medium text-green-700">
                        Free delivery · No advance payment
                      </p>
                    )} */}
                  </div>
                </button>
              </div>
              {paymentMethod === 'cod' && potentialPrepaidSavings > 0 && (
                <p className="mt-3 text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Pay online instead and save an extra 5% with the prepaid
                  discount.
                </p>
              )}
              <input
                type="hidden"
                value={paymentMethod}
                {...register('payment_method')}
              />
            </div>

            <Button
              type="submit"
              variant="brand"
              size="lg"
              className="w-full"
              loading={isSubmitting}
              disabled={
                (paymentMethod === 'cod' && codUnavailable) ||
                (isGuest &&
                  (!isValidPhone ||
                    !phoneVerified ||
                    (emailExists && !accountReclaimed)))
              }
            >
              {paymentMethod === 'cod'
                ? 'Place Cash on Delivery Order'
                : 'Continue to Payment'}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {clientSecret && orderId && (
                <RazorpayPaymentForm
                  orderId={orderId}
                  razorpayOrder={clientSecret}
                  amount={payNowAmount}
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

      <div className="lg:col-span-1">
        <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

          <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-1">
                <div className="relative h-14 w-11 flex-shrink-0 rounded-lg bg-gray-100">
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
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.variant.size} / {item.variant.color}
                  </p>
                </div>
                <p className="text-xs font-bold text-gray-900">
                  {formatPrice(
                    (item.product.price + item.variant.price_modifier) *
                      item.quantity
                  )}
                </p>
              </div>
            ))}
          </div>

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
              <Button
                size="sm"
                variant="outline"
                onClick={handleApplyCoupon}
                loading={isApplyingCoupon}
              >
                Apply
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  {couponData.code}
                </span>
              </div>
              <button
                onClick={handleRemoveCoupon}
                className="text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          )}

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
            {prepaidDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{PREPAID_DISCOUNT_LABEL}</span>
                <span>-{formatPrice(prepaidDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">
                {paymentMethod === 'cod' ? 'Delivery charges' : 'Shipping'}
              </span>
              <span>
                {shippingAmount === 0 ? (
                  <span className="text-green-600">Free</span>
                ) : (
                  formatPrice(shippingAmount)
                )}
              </span>
            </div>
            {paymentMethod === 'cod' && (
              <div className="flex justify-between text-gray-700">
                <span>Pay at delivery</span>
                <span>{formatPrice(productTotal)}</span>
              </div>
            )}
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
