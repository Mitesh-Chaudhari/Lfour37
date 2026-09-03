import type { OrderStatus } from '@/types'

export const ADMIN_ORDERS_PAGE_SIZE = 20

export type AdminOrdersStatusFilter = 'all' | OrderStatus | 'rto'

export type AdminOrdersQuery = {
  q: string
  status: AdminOrdersStatusFilter
  page: number
}

const STATUS_VALUES = new Set<AdminOrdersStatusFilter>([
  'all',
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'return_requested',
  'return_initiated',
  'returned',
  'exchange_initiated',
  'exchanged',
  'rto',
])

export function parseAdminOrdersQuery(
  searchParams: Record<string, string | string[] | undefined>
): AdminOrdersQuery {
  const raw = (key: string) => {
    const value = searchParams[key]
    return Array.isArray(value) ? value[0] : value
  }

  const statusRaw = raw('status') || 'all'
  const pageRaw = Number(raw('page') || '1')

  return {
    q: (raw('q') || '').trim(),
    status: STATUS_VALUES.has(statusRaw as AdminOrdersStatusFilter)
      ? (statusRaw as AdminOrdersStatusFilter)
      : 'all',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  }
}

export function buildAdminOrdersHref(
  query: AdminOrdersQuery,
  updates: Partial<AdminOrdersQuery> = {}
): string {
  const next: AdminOrdersQuery = { ...query, ...updates }
  const params = new URLSearchParams()

  if (next.q) params.set('q', next.q)
  if (next.status !== 'all') params.set('status', next.status)
  if (next.page > 1) params.set('page', String(next.page))

  const qs = params.toString()
  return qs ? `/admin/orders?${qs}` : '/admin/orders'
}
