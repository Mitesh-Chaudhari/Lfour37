'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

type SavedBankAccount = {
  id: string
  account_holder_name: string
  bank_name: string
  account_number: string
  ifsc: string
  is_default?: boolean | null
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
  const [loadingBanks, setLoadingBanks] = useState(false)
  const [uploadingSeal, setUploadingSeal] = useState(false)
  const [reasons, setReasons] = useState<any[]>([])
  const [reasonId, setReasonId] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('source')
  const [savedBanks, setSavedBanks] = useState<SavedBankAccount[]>([])
  const [selectedBankId, setSelectedBankId] = useState<string>('')
  const [useManualBank, setUseManualBank] = useState(false)
  const [accountHolderName, setAccountHolderName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [exchangeSize, setExchangeSize] = useState('')
  const [exchangeColor, setExchangeColor] = useState('')
  const [sealTagUrl, setSealTagUrl] = useState('')
  const [sealPreview, setSealPreview] = useState('')

  const isCodOrder = item.order_payment_method === 'cod'
  const isExchange = mode === 'exchange'
  const needsBankDetails =
    !isExchange && isCodOrder && refundMethod === 'bank'

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
    if (!needsBankDetails) return
    loadBankAccounts()
  }, [needsBankDetails])

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

  useEffect(() => {
    return () => {
      if (sealPreview.startsWith('blob:')) {
        URL.revokeObjectURL(sealPreview)
      }
    }
  }, [sealPreview])

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

  const loadBankAccounts = async () => {
    setLoadingBanks(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('user_bank_accounts')
        .select(
          'id, account_holder_name, bank_name, account_number, ifsc, is_default'
        )
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })

      const accounts = (data || []) as SavedBankAccount[]
      setSavedBanks(accounts)

      if (accounts.length > 0) {
        const preferred =
          accounts.find((account) => account.is_default) || accounts[0]
        setSelectedBankId(preferred.id)
        setUseManualBank(false)
      } else {
        setSelectedBankId('')
        setUseManualBank(true)
      }
    } finally {
      setLoadingBanks(false)
    }
  }

  const handleSealUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      event.target.value = ''
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be under 8MB')
      event.target.value = ''
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setSealPreview(previewUrl)
    setUploadingSeal(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload/return-seal', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok || !data.url) {
        toast.error(data.error || 'Failed to upload seal tag photo')
        setSealPreview('')
        setSealTagUrl('')
        return
      }

      setSealTagUrl(data.url)
      toast.success('Seal tag photo uploaded')
    } catch {
      toast.error('Failed to upload seal tag photo')
      setSealPreview('')
      setSealTagUrl('')
    } finally {
      setUploadingSeal(false)
      event.target.value = ''
    }
  }

  const resolveBankPayload = () => {
    if (!needsBankDetails) return null

    if (!useManualBank && selectedBankId) {
      const selected = savedBanks.find((account) => account.id === selectedBankId)
      if (!selected) return null

      return {
        account_holder_name: selected.account_holder_name,
        bank_name: selected.bank_name,
        account_number: selected.account_number,
        ifsc: selected.ifsc,
        user_bank_account_id: selected.id,
      }
    }

    if (
      !accountHolderName.trim() ||
      !bankName.trim() ||
      !accountNumber.trim() ||
      !ifsc.trim()
    ) {
      return null
    }

    return {
      account_holder_name: accountHolderName.trim(),
      bank_name: bankName.trim(),
      account_number: accountNumber.trim(),
      ifsc: ifsc.trim().toUpperCase(),
      user_bank_account_id: null,
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

    if (!sealTagUrl) {
      toast.error('Upload a photo of the product with the seal tag')
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

    const bankPayload = resolveBankPayload()
    if (needsBankDetails && !bankPayload) {
      toast.error(
        savedBanks.length === 0 || useManualBank
          ? 'Enter bank details for COD refund'
          : 'Select a bank account for COD refund'
      )
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
          return_type: mode,
          seal_tag_image_url: sealTagUrl,
          refund_method: !isExchange
            ? isCodOrder
              ? refundMethod
              : 'source'
            : null,
          bank_account: bankPayload,
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

  const busy = loading || uploadingSeal

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <BlockingContainer
        busy={busy}
        message={
          uploadingSeal
            ? 'Uploading seal tag photo...'
            : 'Submitting your request...'
        }
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5"
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
            disabled={loadingReasons || busy}
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

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Seal tag photo <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500">
            Upload a clear photo of the product with the original seal tag
            intact. Admin will verify this before approving.
          </p>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={handleSealUpload}
            disabled={busy}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />

          {(sealPreview || sealTagUrl) && (
            <div className="relative mt-2 h-40 w-full overflow-hidden rounded-xl border bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sealPreview || sealTagUrl}
                alt="Seal tag preview"
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>

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
                  <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Bank account for refund
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Required for COD returns. Admin will use these details
                          after verification.
                        </p>
                      </div>
                      <Link
                        href="/dashboard/bank-accounts"
                        className="shrink-0 text-xs font-medium text-[#c39c41] underline"
                      >
                        Manage
                      </Link>
                    </div>

                    {loadingBanks ? (
                      <p className="text-sm text-gray-500">
                        Loading saved accounts...
                      </p>
                    ) : savedBanks.length > 0 && !useManualBank ? (
                      <div className="space-y-2">
                        <select
                          className="w-full border rounded-lg p-2 bg-white"
                          value={selectedBankId}
                          onChange={(event) =>
                            setSelectedBankId(event.target.value)
                          }
                        >
                          {savedBanks.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.bank_name} · ****
                              {account.account_number.slice(-4)}
                              {account.is_default ? ' (Default)' : ''}
                            </option>
                          ))}
                        </select>

                        {(() => {
                          const selected = savedBanks.find(
                            (account) => account.id === selectedBankId
                          )
                          if (!selected) return null
                          return (
                            <div className="rounded-lg bg-white border p-3 text-sm text-gray-700 space-y-1">
                              <p>
                                <span className="text-gray-500">Holder:</span>{' '}
                                {selected.account_holder_name}
                              </p>
                              <p>
                                <span className="text-gray-500">Bank:</span>{' '}
                                {selected.bank_name}
                              </p>
                              <p>
                                <span className="text-gray-500">Account:</span>{' '}
                                {selected.account_number}
                              </p>
                              <p>
                                <span className="text-gray-500">IFSC:</span>{' '}
                                {selected.ifsc}
                              </p>
                            </div>
                          )
                        })()}

                        <button
                          type="button"
                          className="text-xs font-medium text-gray-600 underline"
                          onClick={() => setUseManualBank(true)}
                        >
                          Use a different account
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {savedBanks.length === 0 && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                            No bank account saved yet. Enter details below (or
                            add one under Bank Accounts).
                          </p>
                        )}

                        <input
                          placeholder="Account holder name"
                          className="w-full border rounded-lg p-2 bg-white"
                          value={accountHolderName}
                          onChange={(event) =>
                            setAccountHolderName(event.target.value)
                          }
                        />
                        <input
                          placeholder="Bank name"
                          className="w-full border rounded-lg p-2 bg-white"
                          value={bankName}
                          onChange={(event) => setBankName(event.target.value)}
                        />
                        <input
                          placeholder="Account number"
                          className="w-full border rounded-lg p-2 bg-white"
                          value={accountNumber}
                          onChange={(event) =>
                            setAccountNumber(event.target.value)
                          }
                        />
                        <input
                          placeholder="IFSC code"
                          className="w-full border rounded-lg p-2 bg-white"
                          value={ifsc}
                          onChange={(event) => setIfsc(event.target.value)}
                        />

                        {savedBanks.length > 0 && (
                          <button
                            type="button"
                            className="text-xs font-medium text-gray-600 underline"
                            onClick={() => setUseManualBank(false)}
                          >
                            Use a saved account
                          </button>
                        )}
                      </div>
                    )}
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
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={
              busy ||
              loadingReasons ||
              (isExchange && exchangeVariants.length === 0)
            }
          >
            Submit Request
          </Button>
        </div>
      </BlockingContainer>
    </div>
  )
}
