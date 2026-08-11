'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BlockingContainer } from '@/components/ui/blocking-container'
import { createClient } from '@/lib/supabase/client'
import {
  findVariantByDims,
  isSameVariantDims,
  productHasColorOptions,
  productHasSizeOptions,
} from '@/lib/product-variants'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

type ReturnModalMode = 'return' | 'exchange'

type ProductVariantOption = {
  id: string
  size: string | null
  color: string | null
  color_hex?: string | null
  image_url?: string | null
  stock: number | null
  is_active: boolean | null
  sku?: string | null
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
  const [uploadingFront, setUploadingFront] = useState(false)
  const [uploadingBack, setUploadingBack] = useState(false)
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
  const [frontImageUrl, setFrontImageUrl] = useState('')
  const [frontPreview, setFrontPreview] = useState('')
  const [backImageUrl, setBackImageUrl] = useState('')
  const [backPreview, setBackPreview] = useState('')

  const isCodOrder = item.order_payment_method === 'cod'
  const isExchange = mode === 'exchange'
  const needsBankDetails =
    !isExchange && isCodOrder && refundMethod === 'bank'

  const allVariants = useMemo(() => {
    return ((item.product?.variants || []) as ProductVariantOption[]).filter(
      (variant) => variant.is_active !== false
    )
  }, [item.product?.variants])

  const inStockVariants = useMemo(() => {
    return allVariants.filter((variant) => Number(variant.stock || 0) > 0)
  }, [allVariants])

  const requiresSize = productHasSizeOptions(allVariants)
  const requiresColor = productHasColorOptions(allVariants)
  const variantDimOptions = { requireSize: requiresSize, requireColor: requiresColor }

  const exchangeColors = useMemo(() => {
    return Array.from(
      new Set(
        inStockVariants
          .map((variant) => variant.color)
          .filter((color): color is string => Boolean(color?.trim()))
      )
    )
  }, [inStockVariants])

  const exchangeSizes = useMemo(() => {
    return Array.from(
      new Set(
        inStockVariants
          .map((variant) => variant.size)
          .filter((size): size is string => Boolean(size?.trim()))
      )
    )
  }, [inStockVariants])

  const colorHexByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const variant of allVariants) {
      if (variant.color && variant.color_hex && !map.has(variant.color)) {
        map.set(variant.color, variant.color_hex)
      }
    }
    return map
  }, [allVariants])

  const getVariantStock = (size: string, color: string) => {
    const match = findVariantByDims(
      allVariants,
      { size, color },
      variantDimOptions
    )
    return Number(match?.stock || 0)
  }

  const isColorAvailable = (color: string) => {
    return inStockVariants.some((variant) => {
      if (variant.color !== color) return false
      return !isSameVariantDims(
        variant,
        { size: item.variant_size, color: item.variant_color },
        variantDimOptions
      )
    })
  }

  const isSizeAvailable = (size: string) => {
    if (requiresColor && !exchangeColor) {
      return inStockVariants.some((variant) => {
        if (variant.size !== size) return false
        return !isSameVariantDims(
          variant,
          { size: item.variant_size, color: item.variant_color },
          variantDimOptions
        )
      })
    }

    const stock = getVariantStock(size, exchangeColor)
    if (stock <= 0) return false
    return !isSameVariantDims(
      { size, color: exchangeColor },
      { size: item.variant_size, color: item.variant_color },
      variantDimOptions
    )
  }

  const selectionComplete =
    (!requiresSize || Boolean(exchangeSize)) &&
    (!requiresColor || Boolean(exchangeColor))

  const selectedExchangeVariant = useMemo(() => {
    if (!selectionComplete) return null
    return (
      findVariantByDims(
        inStockVariants,
        { size: exchangeSize, color: exchangeColor },
        variantDimOptions
      ) || null
    )
  }, [
    exchangeColor,
    exchangeSize,
    inStockVariants,
    requiresColor,
    requiresSize,
    selectionComplete,
  ])

  const exchangePreviewImage =
    selectedExchangeVariant?.image_url || item.product_image || null

  const hasExchangeOptions = inStockVariants.some(
    (variant) =>
      !isSameVariantDims(
        variant,
        { size: item.variant_size, color: item.variant_color },
        variantDimOptions
      )
  )

  const isSameAsDeliveredSelection = isSameVariantDims(
    { size: exchangeSize, color: exchangeColor },
    { size: item.variant_size, color: item.variant_color },
    variantDimOptions
  )

  const canSubmitExchange =
    selectionComplete &&
    Boolean(selectedExchangeVariant) &&
    !isSameAsDeliveredSelection

  useEffect(() => {
    setReasonId('')
    setCustomReason('')
    void loadReasons()
  }, [isExchange])

  useEffect(() => {
    setRefundMethod(isCodOrder ? 'bank' : 'source')
  }, [isCodOrder])

  useEffect(() => {
    if (!needsBankDetails) return
    loadBankAccounts()
  }, [needsBankDetails])

  useEffect(() => {
    if (!isExchange || !requiresColor) return

    // Prefer keeping the delivered color when exchanging size only
    if (
      !exchangeColor &&
      item.variant_color &&
      inStockVariants.some(
        (variant) =>
          variant.color === item.variant_color &&
          !isSameVariantDims(
            variant,
            { size: item.variant_size, color: item.variant_color },
            variantDimOptions
          )
      )
    ) {
      setExchangeColor(item.variant_color)
    }
  }, [
    exchangeColor,
    inStockVariants,
    isExchange,
    item.variant_color,
    item.variant_size,
    requiresColor,
    requiresSize,
  ])

  useEffect(() => {
    if (!isExchange || !selectionComplete) return

    const stock = getVariantStock(exchangeSize, exchangeColor)
    if (stock <= 0 || isSameAsDeliveredSelection) {
      if (requiresSize) {
        setExchangeSize('')
      } else if (requiresColor) {
        setExchangeColor('')
      }
    }
  }, [
    exchangeColor,
    exchangeSize,
    isExchange,
    isSameAsDeliveredSelection,
    item.variant_color,
    item.variant_size,
    requiresColor,
    requiresSize,
    selectionComplete,
  ])

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
        .eq('kind', isExchange ? 'exchange' : 'return')
        .order('created_at', { ascending: true })

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

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    options: {
      label: string
      setPreview: (url: string) => void
      setUrl: (url: string) => void
      setUploading: (value: boolean) => void
    }
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
    options.setPreview(previewUrl)
    options.setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload/return-seal', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok || !data.url) {
        toast.error(data.error || `Failed to upload ${options.label}`)
        options.setPreview('')
        options.setUrl('')
        return
      }

      options.setUrl(data.url)
      toast.success(`${options.label} uploaded`)
    } catch {
      toast.error(`Failed to upload ${options.label}`)
      options.setPreview('')
      options.setUrl('')
    } finally {
      options.setUploading(false)
      event.target.value = ''
    }
  }

  const handleSealUpload = (event: React.ChangeEvent<HTMLInputElement>) =>
    handleImageUpload(event, {
      label: 'Seal tag photo',
      setPreview: setSealPreview,
      setUrl: setSealTagUrl,
      setUploading: setUploadingSeal,
    })

  const handleFrontUpload = (event: React.ChangeEvent<HTMLInputElement>) =>
    handleImageUpload(event, {
      label: 'Product front photo',
      setPreview: setFrontPreview,
      setUrl: setFrontImageUrl,
      setUploading: setUploadingFront,
    })

  const handleBackUpload = (event: React.ChangeEvent<HTMLInputElement>) =>
    handleImageUpload(event, {
      label: 'Product back photo',
      setPreview: setBackPreview,
      setUrl: setBackImageUrl,
      setUploading: setUploadingBack,
    })

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

    if (!frontImageUrl) {
      toast.error('Upload a clear front photo of the product')
      return
    }

    if (!backImageUrl) {
      toast.error('Upload a clear back photo of the product')
      return
    }

    if (isExchange) {
      if (!hasExchangeOptions) {
        toast.error('No alternate size/color is available for exchange')
        return
      }

      if (requiresColor && !exchangeColor) {
        toast.error('Select an exchange color')
        return
      }

      if (requiresSize && !exchangeSize) {
        toast.error('Select an exchange size')
        return
      }

      if (isSameAsDeliveredSelection) {
        toast.error('Select a different size or color for exchange')
        return
      }

      if (!selectedExchangeVariant) {
        toast.error('Selected size/color is not available for exchange')
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
          product_front_image_url: frontImageUrl,
          product_back_image_url: backImageUrl,
          refund_method: !isExchange
            ? isCodOrder
              ? refundMethod
              : 'source'
            : null,
          bank_account: bankPayload,
          exchange_size: isExchange
            ? selectedExchangeVariant?.size || exchangeSize || null
            : null,
          exchange_color: isExchange
            ? selectedExchangeVariant?.color || exchangeColor || null
            : null,
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

  const busy = loading || uploadingSeal || uploadingFront || uploadingBack

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <BlockingContainer
        busy={busy}
        message={
          uploadingSeal
            ? 'Uploading seal tag photo...'
            : uploadingFront
              ? 'Uploading product front photo...'
              : uploadingBack
                ? 'Uploading product back photo...'
                : 'Submitting your request...'
        }
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5"
      >
        <h2 className="text-xl font-semibold">
          {isExchange ? 'Exchange Item' : 'Return Item'}
        </h2>

        <div className='mb-3'>
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
          <label className="text-md font-medium">
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
            <div className="relative mt-2 h-40 overflow-hidden rounded-xl border bg-gray-50 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sealPreview || sealTagUrl}
                alt="Seal tag preview"
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-md font-medium">
            Product front photo <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500">
            Upload a clear front view of the product.
          </p>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={handleFrontUpload}
            disabled={busy}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />

          {(frontPreview || frontImageUrl) && (
            <div className="relative mt-2 h-40 overflow-hidden rounded-xl border bg-gray-50 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frontPreview || frontImageUrl}
                alt="Product front preview"
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-md font-medium">
            Product back photo <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500">
            Upload a clear back view of the product.
          </p>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={handleBackUpload}
            disabled={busy}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />

          {(backPreview || backImageUrl) && (
            <div className="relative mt-2 h-40 overflow-hidden rounded-xl border bg-gray-50 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={backPreview || backImageUrl}
                alt="Product back preview"
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>

        {isExchange && (
          <div className="space-y-4 my-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div>
              <p className="text-md font-semibold text-gray-900">
                {requiresSize && requiresColor
                  ? 'Select exchange size & color'
                  : requiresSize
                    ? 'Select exchange size'
                    : requiresColor
                      ? 'Select exchange color'
                      : 'Select exchange option'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Choose a different
                {requiresSize && requiresColor
                  ? ' size and/or color'
                  : requiresSize
                    ? ' size'
                    : requiresColor
                      ? ' color'
                      : ' option'}{' '}
                of the same product. Out of stock options are crossed out.
              </p>
            </div>

            <div className="rounded-lg border bg-white p-3 text-xs text-gray-600 space-y-1">
              <p className="font-medium text-gray-800">Currently delivered</p>
              <p>
                {[item.variant_size, item.variant_color]
                  .filter(Boolean)
                  .join(' / ') || '—'}
              </p>
            </div>

            {!hasExchangeOptions ? (
              <p className="text-sm text-red-600">
                No alternate size/color is currently available for exchange.
              </p>
            ) : (
              <>
                {requiresColor && exchangeColors.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-gray-900">
                        Color:
                      </span>
                      {exchangeColor && (
                        <span className="text-sm text-gray-600">
                          {exchangeColor}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {exchangeColors.map((color) => {
                        const available = isColorAvailable(color)
                        const hex = colorHexByName.get(color)
                        return (
                          <button
                            key={color}
                            type="button"
                            disabled={!available || busy}
                            onClick={() => {
                              setExchangeColor(color)
                              if (
                                requiresSize &&
                                exchangeSize &&
                                (getVariantStock(exchangeSize, color) <= 0 ||
                                  isSameVariantDims(
                                    { size: exchangeSize, color },
                                    {
                                      size: item.variant_size,
                                      color: item.variant_color,
                                    },
                                    variantDimOptions
                                  ))
                              ) {
                                setExchangeSize('')
                              }
                            }}
                            className={cn(
                              'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border-2 transition-all bg-white',
                              exchangeColor === color
                                ? 'border-[#c39c41] bg-[#c39c41]/10 text-gray-900'
                                : available
                                  ? 'border-gray-300 text-gray-700 hover:border-[#c39c41]/60'
                                  : 'border-gray-200 text-gray-300 cursor-not-allowed opacity-60'
                            )}
                          >
                            {hex && (
                              <span
                                className="h-4 w-4 rounded-full border border-black/10 shrink-0"
                                style={{ backgroundColor: hex }}
                              />
                            )}
                            {color}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {requiresSize && exchangeSizes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-gray-900">
                        Size:
                      </span>
                      {exchangeSize && (
                        <span className="text-sm text-gray-600">
                          {exchangeSize}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {exchangeSizes.map((size) => {
                        const available = isSizeAvailable(size)
                        return (
                          <button
                            key={size}
                            type="button"
                            disabled={
                              !available ||
                              busy ||
                              (requiresColor && !exchangeColor)
                            }
                            onClick={() => setExchangeSize(size)}
                            className={cn(
                              'relative h-10 min-w-[44px] px-3 text-sm font-medium rounded-lg border-2 transition-all bg-white',
                              exchangeSize === size
                                ? 'border-[#c39c41] bg-[#c39c41]/10 text-gray-900'
                                : available
                                  ? 'border-gray-300 text-gray-700 hover:border-[#c39c41]/60'
                                  : 'border-gray-200 text-gray-300 cursor-not-allowed opacity-60'
                            )}
                          >
                            {size}
                            {!available && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <span className="absolute h-px w-full bg-gray-300 rotate-45" />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {requiresColor && !exchangeColor && (
                      <p className="text-xs text-gray-500 mt-2">
                        Select a color first to see available sizes.
                      </p>
                    )}
                  </div>
                )}

                {selectedExchangeVariant && (
                  <div className="rounded-lg border border-[#c39c41]/40 bg-white p-3 flex gap-3">
                    {exchangePreviewImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={exchangePreviewImage}
                        alt="Exchange variant"
                        className="h-16 w-16 rounded-md object-cover border bg-gray-50"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-md bg-gray-100 border" />
                    )}
                    <div className="text-sm min-w-0">
                      <p className="font-medium text-gray-900">
                        You will receive
                      </p>
                      <p className="text-gray-700">
                        {[
                          selectedExchangeVariant.size || exchangeSize,
                          selectedExchangeVariant.color || exchangeColor,
                        ]
                          .filter(Boolean)
                          .join(' / ')}
                      </p>
                      {selectedExchangeVariant.sku && (
                        <p className="text-xs text-gray-500 mt-0.5 font-mono">
                          SKU: {selectedExchangeVariant.sku}
                        </p>
                      )}
                      <p className="text-xs text-green-700 mt-1">
                        In stock ({selectedExchangeVariant.stock})
                      </p>
                    </div>
                  </div>
                )}

                {hasExchangeOptions && !canSubmitExchange && (
                  <p className="text-xs text-amber-700">
                    {requiresColor && !exchangeColor
                      ? 'Select a color to continue.'
                      : requiresSize && !exchangeSize
                        ? 'Select a size to continue.'
                        : 'Select a different size or color than the delivered item.'}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {!isExchange && (
          <>
            {isCodOrder ? (
              <>
                <div className='mt-4'>
                  <label className="text-lg font-medium">
                    Refund Payment Method
                  </label>

                  <select
                    className="w-full border rounded-lg p-2 mt-1"
                    value={refundMethod}
                    onChange={(event) => setRefundMethod(event.target.value)}
                  >
                    <option value="bank">Bank Account</option>
                    {/* <option value="store_credit">Store Credit</option> */}
                  </select>
                </div>

                {refundMethod === 'bank' && (
                  <div className="space-y-3 my-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
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
              (isExchange && (!hasExchangeOptions || !canSubmitExchange))
            }
          >
            Submit Request
          </Button>
        </div>
      </BlockingContainer>
    </div>
  )
}
