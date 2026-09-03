export const ADMIN_RETURNS_PAGE_SIZE = 20

export type AdminReturnsStatusFilter =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'all'

export type AdminReturnsTypeFilter = 'all' | 'return' | 'exchange'

export type AdminReturnsQuery = {
  q: string
  status: AdminReturnsStatusFilter
  type: AdminReturnsTypeFilter
  page: number
}

const STATUS_VALUES = new Set<AdminReturnsStatusFilter>([
  'requested',
  'approved',
  'rejected',
  'all',
])

const TYPE_VALUES = new Set<AdminReturnsTypeFilter>([
  'all',
  'return',
  'exchange',
])

export function parseAdminReturnsQuery(
  searchParams: Record<string, string | string[] | undefined>
): AdminReturnsQuery {
  const raw = (key: string) => {
    const value = searchParams[key]
    return Array.isArray(value) ? value[0] : value
  }

  const statusRaw = raw('status') || 'requested'
  const typeRaw = raw('type') || 'all'
  const pageRaw = Number(raw('page') || '1')

  return {
    q: (raw('q') || '').trim(),
    status: STATUS_VALUES.has(statusRaw as AdminReturnsStatusFilter)
      ? (statusRaw as AdminReturnsStatusFilter)
      : 'requested',
    type: TYPE_VALUES.has(typeRaw as AdminReturnsTypeFilter)
      ? (typeRaw as AdminReturnsTypeFilter)
      : 'all',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  }
}

export function buildAdminReturnsHref(
  query: AdminReturnsQuery,
  updates: Partial<AdminReturnsQuery> = {}
): string {
  const next: AdminReturnsQuery = { ...query, ...updates }
  const params = new URLSearchParams()

  if (next.q) params.set('q', next.q)
  if (next.status !== 'requested') params.set('status', next.status)
  if (next.type !== 'all') params.set('type', next.type)
  if (next.page > 1) params.set('page', String(next.page))

  const qs = params.toString()
  return qs ? `/admin/returns?${qs}` : '/admin/returns'
}

export function returnStatusLabel(status: string | null | undefined): string {
  return (status || '').replace(/_/g, ' ').toUpperCase() || '—'
}
