import type { Product, ProductStatus } from '@/types'

export const ADMIN_PRODUCTS_PAGE_SIZE = 10

export type AdminProductSort =
  | 'list_sort_order'
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'sold_desc'
  | 'sold_asc'

export type AdminProductFlag = 'all' | 'featured' | 'new' | 'trending' | 'sale'

export type AdminCategory = {
  id: string
  name: string
  slug: string
  parent_id: string | null
}

export type AdminProduct = Product & {
  product_categories?: Array<{
    category?: {
      id: string
      name: string
      slug: string
      parent_id: string | null
    } | null
  }> | null
}

export type AdminProductsQuery = {
  q: string
  status: 'all' | ProductStatus
  category: string
  flag: AdminProductFlag
  sort: AdminProductSort
  page: number
}

const SORT_VALUES = new Set<AdminProductSort>([
  'list_sort_order',
  'newest',
  'oldest',
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'sold_desc',
  'sold_asc',
])

const STATUS_VALUES = new Set<'all' | ProductStatus>([
  'all',
  'active',
  'inactive',
  'draft',
])

const FLAG_VALUES = new Set<AdminProductFlag>([
  'all',
  'featured',
  'new',
  'trending',
  'sale',
])

export function parseAdminProductsQuery(
  searchParams: Record<string, string | string[] | undefined>
): AdminProductsQuery {
  const raw = (key: string) => {
    const value = searchParams[key]
    return Array.isArray(value) ? value[0] : value
  }

  const statusRaw = raw('status') || 'all'
  const flagRaw = raw('flag') || 'all'
  const sortRaw = raw('sort') || 'list_sort_order'
  const pageRaw = Number(raw('page') || '1')

  return {
    q: (raw('q') || '').trim(),
    status: STATUS_VALUES.has(statusRaw as 'all' | ProductStatus)
      ? (statusRaw as 'all' | ProductStatus)
      : 'all',
    category: raw('category') || 'all',
    flag: FLAG_VALUES.has(flagRaw as AdminProductFlag)
      ? (flagRaw as AdminProductFlag)
      : 'all',
    sort: SORT_VALUES.has(sortRaw as AdminProductSort)
      ? (sortRaw as AdminProductSort)
      : 'list_sort_order',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  }
}

export function buildAdminProductsHref(
  query: AdminProductsQuery,
  updates: Partial<AdminProductsQuery> = {}
): string {
  const next: AdminProductsQuery = { ...query, ...updates }
  const params = new URLSearchParams()

  if (next.q) params.set('q', next.q)
  if (next.status !== 'all') params.set('status', next.status)
  if (next.category !== 'all') params.set('category', next.category)
  if (next.flag !== 'all') params.set('flag', next.flag)
  if (next.sort !== 'list_sort_order') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))

  const qs = params.toString()
  return qs ? `/admin/products?${qs}` : '/admin/products'
}
