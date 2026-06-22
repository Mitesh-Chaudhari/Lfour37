'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BlockingContainer } from '@/components/ui/blocking-container'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ReturnModal({
  item,
  onClose,
}: any) {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [loadingReasons, setLoadingReasons] = useState(true)

  const [reasons, setReasons] = useState<any[]>([])

  const [reasonId, setReasonId] = useState('')
  const [customReason, setCustomReason] = useState('')

  const [returnType, setReturnType] = useState('return')

  const [refundMethod, setRefundMethod] = useState('source')

  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifsc, setIfsc] = useState('')

  const [exchangeSize, setExchangeSize] = useState('')
  const [exchangeColor, setExchangeColor] = useState('')

  useEffect(() => {
    loadReasons()
  }, [])

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
    if (!reasonId && !customReason) {
      toast.error('Select reason')
      return
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
        return_type: returnType,
        refund_method: refundMethod,

        bank_account:
          refundMethod === 'bank'
            ? {
                bank_name: bankName,
                account_number: accountNumber,
                ifsc,
              }
            : null,

        exchange_size: exchangeSize || null,
        exchange_color: exchangeColor || null,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      toast.error(data.error || 'Failed')
      return
    }

    toast.success('Request submitted')

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
          Return / Exchange
        </h2>

        {/* Type */}
        <div>
          <label className="text-sm font-medium">
            Request Type
          </label>

          <select
            className="w-full border rounded-lg p-2 mt-1"
            value={returnType}
            onChange={(e) => setReturnType(e.target.value)}
          >
            <option value="return">Return</option>
            <option value="exchange">Exchange</option>
          </select>
        </div>

        {/* Reason */}
        <div>
          <label className="text-sm font-medium">
            Reason
          </label>

          <select
            className="w-full border rounded-lg p-2 mt-1 disabled:bg-gray-50"
            value={reasonId}
            onChange={(e) => setReasonId(e.target.value)}
            disabled={loadingReasons || loading}
          >
            <option value="">
              {loadingReasons ? 'Loading reasons...' : 'Select reason'}
            </option>

            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}

            <option value="other">Other</option>
          </select>
        </div>

        {(reasonId === 'other' || !reasonId) && (
          <textarea
            placeholder="Enter custom reason"
            className="w-full border rounded-lg p-2"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
          />
        )}

        {/* Exchange */}
        {returnType === 'exchange' && (
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="New Size"
              className="border rounded-lg p-2"
              value={exchangeSize}
              onChange={(e) => setExchangeSize(e.target.value)}
            />

            <input
              placeholder="New Color"
              className="border rounded-lg p-2"
              value={exchangeColor}
              onChange={(e) => setExchangeColor(e.target.value)}
            />
          </div>
        )}

        {/* Refund Method */}
        {returnType === 'return' && (
          <>
            <div>
              <label className="text-sm font-medium">
                Refund Method
              </label>

              <select
                className="w-full border rounded-lg p-2 mt-1"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
              >
                <option value="source">
                  Back to original payment source
                </option>

                <option value="bank">
                  Bank Account
                </option>

                <option value="store_credit">
                  Store Credit
                </option>
              </select>
            </div>

            {refundMethod === 'bank' && (
              <div className="space-y-3">
                <input
                  placeholder="Bank Name"
                  className="w-full border rounded-lg p-2"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />

                <input
                  placeholder="Account Number"
                  className="w-full border rounded-lg p-2"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />

                <input
                  placeholder="IFSC Code"
                  className="w-full border rounded-lg p-2"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={loadingReasons}
          >
            Submit Request
          </Button>
        </div>
      </BlockingContainer>
    </div>
  )
}