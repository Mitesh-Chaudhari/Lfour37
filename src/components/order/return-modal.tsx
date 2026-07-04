'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BlockingContainer } from '@/components/ui/blocking-container'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

type ReturnModalMode = 'return' | 'exchange'

type ProductVariantOption = {
  id: string
  size: string | null
  color: string | null
  stock: number | null
  is_active: boolean | null
}

export default function ReturnModal({
  item,
  mode,
  onClose,
}: {
  item: any
  mode: ReturnModalMode
  onClose: () => void
}) {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [loadingReasons, setLoadingReasons] = useState(true)
  const [reasons, setReasons] = useState<any[]>([])
  const [reasonId, setReasonId] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('source')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [exchangeSize, setExchangeSize] = useState('')
  const [exchangeColor, setExchangeColor] = useState('')

  const isCodOrder = item.order_payment_method === 'cod'
  const isExchange = mode === 'exchange'

  const exchangeVariants = useMemo(() => {
    const variants = (item.product?.variants || []) as ProductVariantOption[]

    return variants.filter((variant) => {
      if (variant.is_active === false) return false
      if (Number(variant.stock || 0) <= 0) return false
      if (variant.id === item.variant_id) return false

      return true
    })
  }, [item.product?.variants, item.variant_id])

  const exchangeSizes = useMemo(() => {
    return Array.from(
      new Set(exchangeVariants.map((variant) => variant.size).filter(Boolean))
    ) as string[]
  }, [exchangeVariants])

  const exchangeColors = useMemo(() => {
    return Array.from(
      new Set(
        exchangeVariants
          .filter((variant) => !exchangeSize || variant.size === exchangeSize)
          .map((variant) => variant.color)
          .filter(Boolean)
      )
    ) as string[]
  }, [exchangeSize, exchangeVariants])

  useEffect(() => {
    loadReasons()
  }, [])

  useEffect(() => {
    setRefundMethod(isCodOrder ? 'bank' : 'source')
  }, [isCodOrder])

  useEffect(() => {
    if (!isExchange) return

    if (!exchangeSize && exchangeSizes[0]) {
      setExchangeSize(exchangeSizes[0])
      return
    }

    if (exchangeSize && !exchangeColors.includes(exchangeColor)) {
      setExchangeColor(exchangeColors[0] || '')
    }
  }, [exchangeColor, exchangeColors, exchangeSize, exchangeSizes, isExchange])

  const loadReasons = async () => {
    setLoadingReasons(true)
    try {
      const { data } = await supabase
        .from('return_reasons')
        .select('*')
        .eq('is_active', true)

      setReasons(data || [])
    } finally {
      setLoadingReasons(false)
    }
  }

  const handleSubmit = async () => {
    if (!reasonId && !customReason.trim()) {
      toast.error(`Select ${isExchange ? 'exchange' : 'return'} reason`)
      return
    }

    if (reasonId === 'other' && !customReason.trim()) {
      toast.error('Please enter reason')
      return
    }

    if (isExchange) {
      if (!exchangeSize || !exchangeColor) {
        toast.error('Select new size and color')
        return
      }

      if (
        exchangeSize === item.variant_size &&
        exchangeColor === item.variant_color
      ) {
        toast.error('Select a different size or color for exchange')
        return
      }
    }

    if (!isExchange && isCodOrder && refundMethod === 'bank') {
      if (!bankName.trim() || !accountNumber.trim() || !ifsc.trim()) {
        toast.error('Enter bank details for COD refund')
        return
      }
    }

    setLoading(true)

    try {
      const res = await fetch('/api/orders/return-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_item_id: item.id,
          return_reason_id: reasonId || null,
          return_custom_reason: customReason || null,
          return_type: mode,
          refund_method: !isExchange
            ? isCodOrder
              ? refundMethod
              : 'source'
            : null,
          bank_account:
            !isExchange && isCodOrder && refundMethod === 'bank'
              ? {
                  bank_name: bankName,
                  account_number: accountNumber,
                  ifsc,
                }
              : null,
          exchange_size: isExchange ? exchangeSize : null,
          exchange_color: isExchange ? exchangeColor : null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed')
        return
      }

      toast.success(`${isExchange ? 'Exchange' : 'Return'} request submitted`)
      onClose()
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <BlockingContainer
        busy={loading}
        message="Submitting your request..."
        className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-5"
      >
        <h2 className="text-xl font-semibold">
          {isExchange ? 'Exchange Item' : 'Return Item'}
        </h2>

        <div>
          <label className="text-sm font-medium">
            {isExchange ? 'Exchange Reason' : 'Return Reason'}
          </label>

          <select
            className="w-full border rounded-lg p-2 mt-1 disabled:bg-gray-50"
            value={reasonId}
            onChange={(event) => setReasonId(event.target.value)}
            disabled={loadingReasons || loading}
          >
            <option value="">
              {loadingReasons ? 'Loading reasons...' : 'Select reason'}
            </option>

            {reasons.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.label}
              </option>
            ))}

            <option value="other">Other</option>
          </select>
        </div>

        {(reasonId === 'other' || !reasonId) && (
          <textarea
            placeholder={`Enter ${isExchange ? 'exchange' : 'return'} reason`}
            className="w-full border rounded-lg p-2"
            value={customReason}
            onChange={(event) => setCustomReason(event.target.value)}
          />
        )}

        {isExchange && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Select a different size or color for the same product.
            </p>

            {exchangeVariants.length === 0 ? (
              <p className="text-sm text-red-600">
                No alternate size/color is currently available for exchange.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">New Size</label>
                  <select
                    className="w-full border rounded-lg p-2 mt-1"
                    value={exchangeSize}
                    onChange={(event) => {
                      setExchangeSize(event.target.value)
                      setExchangeColor('')
                    }}
                  >
                    <option value="">Select size</option>
                    {exchangeSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">New Color</label>
                  <select
                    className="w-full border rounded-lg p-2 mt-1"
                    value={exchangeColor}
                    onChange={(event) => setExchangeColor(event.target.value)}
                    disabled={!exchangeSize}
                  >
                    <option value="">Select color</option>
                    {exchangeColors.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {!isExchange && (
          <>
            {isCodOrder ? (
              <>
                <div>
                  <label className="text-sm font-medium">
                    Refund Payment Method
                  </label>

                  <select
                    className="w-full border rounded-lg p-2 mt-1"
                    value={refundMethod}
                    onChange={(event) => setRefundMethod(event.target.value)}
                  >
                    <option value="bank">Bank Account</option>
                    <option value="store_credit">Store Credit</option>
                  </select>
                </div>

                {refundMethod === 'bank' && (
                  <div className="space-y-3">
                    <input
                      placeholder="Bank Name"
                      className="w-full border rounded-lg p-2"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                    />

                    <input
                      placeholder="Account Number"
                      className="w-full border rounded-lg p-2"
                      value={accountNumber}
                      onChange={(event) => setAccountNumber(event.target.value)}
                    />

                    <input
                      placeholder="IFSC Code"
                      className="w-full border rounded-lg p-2"
                      value={ifsc}
                      onChange={(event) => setIfsc(event.target.value)}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                Refund will be processed to your original payment method after
                the returned product is checked.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={loadingReasons || (isExchange && exchangeVariants.length === 0)}
          >
            Submit Request
          </Button>
        </div>
      </BlockingContainer>
    </div>
  )
}
