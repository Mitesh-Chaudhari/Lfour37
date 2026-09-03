'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { formatDate, formatPrice } from '@/lib/utils'
import {
  ADMIN_RETURNS_PAGE_SIZE,
  buildAdminReturnsHref,
  returnStatusLabel,
  type AdminReturnsQuery,
  type AdminReturnsStatusFilter,
  type AdminReturnsTypeFilter,
} from '@/lib/admin-returns'
import type { AdminReturnItem } from '@/lib/admin-returns-query'

function getPageNumbers(
  currentPage: number,
  totalPages: number
): Array<number | 'ellipsis'> {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2
  )

  const withEllipsis: Array<number | 'ellipsis'> = []
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) {
      withEllipsis.push('ellipsis')
    }
    withEllipsis.push(pages[i])
  }
  return withEllipsis
}

function ReturnPhoto({
  label,
  url,
}: {
  label: string
  url?: string | null
}) {
  if (!url) return null

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-500">{label}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="h-28 w-auto max-w-[140px] rounded-lg border object-cover"
        />
      </a>
    </div>
  )
}

function canProcessItemRefund(item: AdminReturnItem): boolean {
  if (item.refund_status === 'completed') return false

  const refundableState =
    (item.return_status === 'return_approved' &&
      item.return_type === 'return' &&
      item.status === 'returned') ||
    item.status === 'cancelled'

  if (!refundableState) return false
  if (item.order?.payment_method === 'cod') return true
  return item.order?.payment_status === 'completed'
}

function statusBadgeVariant(
  status: string | null | undefined
): 'warning' | 'success' | 'destructive' | 'default' {
  if (status === 'return_requested') return 'warning'
  if (status === 'return_approved') return 'success'
  if (status === 'return_rejected') return 'destructive'
  return 'default'
}

interface AdminReturnsTableProps {
  items: AdminReturnItem[]
  totalCount: number
  pendingCount: number
  page: number
  totalPages: number
  query: AdminReturnsQuery
}

export function AdminReturnsTable({
  items: itemsFromServer,
  totalCount,
  pendingCount,
  page,
  totalPages,
  query,
}: AdminReturnsTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState(itemsFromServer)
  const [searchInput, setSearchInput] = useState(query.q)
  const [busyId, setBusyId] = useState<string | null>(null)

  const rangeStart =
    totalCount === 0 ? 0 : (page - 1) * ADMIN_RETURNS_PAGE_SIZE + 1
  const rangeEnd = Math.min(page * ADMIN_RETURNS_PAGE_SIZE, totalCount)
  const hasActiveFilters =
    query.q !== '' || query.status !== 'requested' || query.type !== 'all'

  const navigate = (updates: Partial<AdminReturnsQuery>) => {
    startTransition(() => {
      router.push(buildAdminReturnsHref(query, updates))
    })
  }

  useEffect(() => {
    setItems(itemsFromServer)
  }, [itemsFromServer])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [router])

  useEffect(() => {
    setSearchInput(query.q)
  }, [query.q])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextQ = searchInput.trim()
      if (nextQ === query.q) return
      startTransition(() => {
        router.push(buildAdminReturnsHref(query, { q: nextQ, page: 1 }))
      })
    }, 350)

    return () => window.clearTimeout(handle)
  }, [searchInput, query, router])

  const approveReturn = async (item: AdminReturnItem) => {
    setBusyId(item.id)
    try {
      const res = await fetch('/api/admin/orders/approve-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to approve')
        if (data.code === 'already_processed') {
          router.refresh()
        }
        return
      }

      const reverseAwb = data.delhivery?.reverseAwb
      const exchangeAwb = data.delhivery?.exchangeForwardAwb
      toast.success(
        reverseAwb
          ? `Approved. Reverse AWB: ${reverseAwb}${
              exchangeAwb ? `, Exchange AWB: ${exchangeAwb}` : ''
            }`
          : 'Request approved'
      )

      // Instant UI sync; pending filter drops the card, otherwise update status.
      setItems((current) =>
        query.status === 'requested'
          ? current.filter((row) => row.id !== item.id)
          : current.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    return_status: 'return_approved',
                    status:
                      row.return_type === 'exchange'
                        ? 'exchange_initiated'
                        : 'return_initiated',
                    reverse_pickup: {
                      ...(row.reverse_pickup || {}),
                      awb: reverseAwb || row.reverse_pickup?.awb || null,
                      exchange_forward_awb:
                        exchangeAwb ||
                        row.reverse_pickup?.exchange_forward_awb ||
                        null,
                      status: row.reverse_pickup?.status || 'Scheduled',
                    },
                  }
                : row
            )
      )
      router.refresh()
    } catch {
      toast.error('Failed to approve return')
    } finally {
      setBusyId(null)
    }
  }

  const rejectReturn = async (item: AdminReturnItem) => {
    if (
      !confirm(
        `Reject this ${item.return_type === 'exchange' ? 'exchange' : 'return'} request?`
      )
    ) {
      return
    }

    setBusyId(item.id)
    try {
      const res = await fetch('/api/admin/orders/reject-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to reject')
        if (data.code === 'already_processed') {
          router.refresh()
        }
        return
      }
      toast.success('Request rejected')
      setItems((current) =>
        query.status === 'requested'
          ? current.filter((row) => row.id !== item.id)
          : current.map((row) =>
              row.id === item.id
                ? { ...row, return_status: 'return_rejected' }
                : row
            )
      )
      router.refresh()
    } catch {
      toast.error('Failed to reject return')
    } finally {
      setBusyId(null)
    }
  }

  const processRefund = async (item: AdminReturnItem) => {
    const refundTarget =
      item.refund_method === 'bank'
        ? 'the customer bank account'
        : 'the original payment method'

    if (
      !confirm(
        `Refund ${formatPrice(item.total_price)} for ${item.product_name} to ${refundTarget}?`
      )
    ) {
      return
    }

    setBusyId(item.id)
    try {
      const res = await fetch('/api/admin/orders/refund-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Refund failed')
        return
      }
      toast.success(data.message || 'Refund initiated')
      router.refresh()
    } catch {
      toast.error('Refund request failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={`space-y-4 ${isPending ? 'opacity-70 transition-opacity' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Search order #, email, or product..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={query.status}
          disabled={isPending}
          onChange={(e) =>
            navigate({
              status: e.target.value as AdminReturnsStatusFilter,
              page: 1,
            })
          }
          className="px-4 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="requested">Pending review ({pendingCount})</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All requests</option>
        </select>
        <select
          value={query.type}
          disabled={isPending}
          onChange={(e) =>
            navigate({
              type: e.target.value as AdminReturnsTypeFilter,
              page: 1,
            })
          }
          className="px-4 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">Returns & exchanges</option>
          <option value="return">Returns only</option>
          <option value="exchange">Exchanges only</option>
        </select>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setSearchInput('')
              startTransition(() => router.push(pathname))
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {items.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 py-12 text-center text-gray-400">
            No return or exchange requests found
          </div>
        )}

        {items.map((item) => {
          const order = item.order
          const customer =
            order?.user?.full_name ||
            order?.shipping_address?.full_name ||
            'Unknown'
          const email = order?.user?.email || ''
          const phone =
            order?.user?.phone || order?.shipping_address?.phone || ''
          const reason =
            item.return_reason?.label || item.return_custom_reason || '—'
          const isExchange = item.return_type === 'exchange'
          const busy = busyId === item.id

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4 min-w-0">
                  <div className="relative h-16 w-14 flex-shrink-0 rounded-lg bg-gray-100 overflow-hidden">
                    {item.product_image && (
                      <OptimizedImage
                        src={item.product_image}
                        alt={item.product_name}
                        fill
                        variant="adminThumb"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusBadgeVariant(item.return_status)}>
                        {returnStatusLabel(item.return_status)}
                      </Badge>
                      <Badge variant="default">
                        {(item.return_type || 'return').toUpperCase()}
                      </Badge>
                    </div>
                    <p className="font-semibold text-gray-900">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {[item.variant_size, item.variant_color]
                        .filter(Boolean)
                        .join(' / ') || '—'}{' '}
                      · Qty {item.quantity} · {formatPrice(item.total_price)}
                    </p>
                    <p className="text-sm text-gray-700">
                      Reason:{' '}
                      <span className="font-medium text-gray-900">{reason}</span>
                    </p>
                    {item.return_requested_at && (
                      <p className="text-xs text-gray-400">
                        Requested {formatDate(item.return_requested_at)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-sm text-gray-600 lg:text-right min-w-[200px]">
                  {order?.order_number && (
                    <Link
                      href={`/admin/orders?q=${encodeURIComponent(order.order_number)}`}
                      className="font-medium text-purple-700 hover:underline"
                    >
                      {order.order_number}
                    </Link>
                  )}
                  <p>{customer}</p>
                  {email && <p className="text-xs text-gray-400">{email}</p>}
                  {phone && <p className="text-xs text-gray-400">{phone}</p>}
                  {order?.shipping_address && (
                    <p className="text-xs text-gray-400">
                      {[
                        order.shipping_address.city,
                        order.shipping_address.state,
                        order.shipping_address.postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {isExchange && (item.exchange_size || item.exchange_color) && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p className="font-medium text-amber-900">Exchange variant</p>
                  <p className="text-gray-600">
                    Delivered:{' '}
                    {[item.variant_size, item.variant_color]
                      .filter(Boolean)
                      .join(' / ') || '—'}
                  </p>
                  <p className="text-gray-900">
                    Customer wants:{' '}
                    <span className="font-semibold">
                      {[item.exchange_size, item.exchange_color]
                        .filter(Boolean)
                        .join(' / ') || '—'}
                    </span>
                  </p>
                </div>
              )}

              {item.refund_method === 'bank' && item.bank_account && (
                <div className="mt-4 rounded-lg border bg-gray-50 p-3 text-xs text-gray-700 space-y-0.5">
                  <p className="font-medium text-gray-800">Refund bank account</p>
                  {item.bank_account.account_holder_name && (
                    <p>Holder: {item.bank_account.account_holder_name}</p>
                  )}
                  {item.bank_account.bank_name && (
                    <p>Bank: {item.bank_account.bank_name}</p>
                  )}
                  {item.bank_account.account_number && (
                    <p>A/C: {item.bank_account.account_number}</p>
                  )}
                  {item.bank_account.ifsc && <p>IFSC: {item.bank_account.ifsc}</p>}
                </div>
              )}

              <div className="mt-4">
                <p className="text-sm font-medium text-gray-800 mb-2">
                  Customer photos
                </p>
                {item.seal_tag_image_url ||
                item.product_front_image_url ||
                item.product_back_image_url ? (
                  <div className="flex flex-wrap gap-3">
                    <ReturnPhoto label="Seal tag" url={item.seal_tag_image_url} />
                    <ReturnPhoto label="Front" url={item.product_front_image_url} />
                    <ReturnPhoto label="Back" url={item.product_back_image_url} />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No photos uploaded</p>
                )}
              </div>

              {item.reverse_pickup?.awb && (
                <div className="mt-4 text-xs text-gray-600 space-y-1">
                  <p>
                    Reverse AWB:{' '}
                    <span className="font-mono font-medium">
                      {item.reverse_pickup.awb}
                    </span>
                  </p>
                  {item.reverse_pickup.exchange_forward_awb && (
                    <p>
                      Exchange AWB:{' '}
                      <span className="font-mono font-medium">
                        {item.reverse_pickup.exchange_forward_awb}
                      </span>
                    </p>
                  )}
                  {item.reverse_pickup.status && (
                    <p>Carrier: {item.reverse_pickup.status}</p>
                  )}
                  {item.reverse_pickup.error_message && (
                    <p className="text-red-600">
                      {item.reverse_pickup.error_message}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {item.return_status === 'return_requested' && (
                  <>
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={busy}
                      onClick={() => approveReturn(item)}
                    >
                      {isExchange ? 'Approve Exchange' : 'Approve Return'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => rejectReturn(item)}
                    >
                      {isExchange ? 'Reject Exchange' : 'Reject Return'}
                    </Button>
                  </>
                )}
                {canProcessItemRefund(item) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200"
                    disabled={busy}
                    onClick={() => processRefund(item)}
                  >
                    Process Refund
                  </Button>
                )}
                {item.refund_status === 'completed' && (
                  <p className="text-xs text-green-700 self-center">
                    Refunded {formatPrice(item.refunded_amount || item.total_price)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {totalCount > 0 && (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Showing{' '}
            <span className="font-medium text-gray-900">
              {rangeStart}–{rangeEnd}
            </span>{' '}
            of <span className="font-medium text-gray-900">{totalCount}</span>
            <span className="text-gray-400">
              {' '}
              · Page {page} of {totalPages} · {ADMIN_RETURNS_PAGE_SIZE} per page
            </span>
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate({ page: Math.max(1, page - 1) })}
              disabled={page <= 1 || isPending}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            {getPageNumbers(page, totalPages).map((entry, index) =>
              entry === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 text-sm text-gray-400"
                >
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  onClick={() => navigate({ page: entry })}
                  disabled={isPending}
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm transition-colors ${
                    page === entry
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {entry}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => navigate({ page: Math.min(totalPages, page + 1) })}
              disabled={page >= totalPages || isPending}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
