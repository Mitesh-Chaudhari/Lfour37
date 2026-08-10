import { createClient } from '@/lib/supabase/server'
import { getCategoryDescendantIds } from '@/lib/categories'
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

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function resolveRestrictedProductIds(
  supabase: SupabaseClient,
  query: AdminProductsQuery,
  categories: AdminCategory[]
): Promise<string[] | null> {
  let restrictedIds: Set<string> | null = null

  const intersect = (
    current: Set<string> | null,
    ids: string[]
  ): Set<string> => {
    if (current === null) return new Set(ids)
    const next = new Set<string>()
    for (const id of ids) {
      if (current.has(id)) next.add(id)
    }
    return next
  }

  if (query.category !== 'all') {
    if (!categories.some((category) => category.id === query.category)) {
      return []
    }

    const descendantIds = getCategoryDescendantIds(query.category, categories)
    const { data: links, error } = await supabase
      .from('product_categories')
      .select('product_id')
      .in('category_id', descendantIds)

    if (error) throw error

    restrictedIds = intersect(restrictedIds, [
      ...new Set((links || []).map((row) => row.product_id).filter(Boolean)),
    ])
    if (restrictedIds.size === 0) return []
  }

  if (query.flag === 'sale') {
    // Lightweight id/price fields only — avoids loading full product rows.
    const { data: candidates, error } = await supabase
      .from('products')
      .select('id, price, compare_price')

    if (error) throw error

    restrictedIds = intersect(
      restrictedIds,
      (candidates || [])
        .filter(
          (row) =>
            row.compare_price != null &&
            Number(row.compare_price) > Number(row.price)
        )
        .map((row) => row.id)
    )
    if (restrictedIds.size === 0) return []
  }

  return restrictedIds ? [...restrictedIds] : null
}

function applyProductFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbQuery: any,
  query: AdminProductsQuery,
  restrictedIds: string[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let next = dbQuery

  if (restrictedIds) {
    next = next.in('id', restrictedIds)
  }

  if (query.status !== 'all') {
    next = next.eq('status', query.status)
  }

  if (query.flag === 'featured') {
    next = next.eq('is_featured', true)
  } else if (query.flag === 'new') {
    next = next.eq('is_new_arrival', true)
  } else if (query.flag === 'trending') {
    next = next.eq('is_trending', true)
  }

  if (query.q) {
    const term = escapeIlike(query.q)
    next = next.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,slug.ilike.%${term}%,barcode.ilike.%${term}%`
    )
  }

  switch (query.sort) {
    case 'newest':
      return next.order('created_at', { ascending: false })
    case 'oldest':
      return next.order('created_at', { ascending: true })
    case 'name_asc':
      return next.order('name', { ascending: true })
    case 'name_desc':
      return next.order('name', { ascending: false })
    case 'price_asc':
      return next.order('price', { ascending: true })
    case 'price_desc':
      return next.order('price', { ascending: false })
    case 'sold_desc':
      return next.order('total_sold', { ascending: false })
    case 'sold_asc':
      return next.order('total_sold', { ascending: true })
    case 'list_sort_order':
    default:
      return next
        .order('list_sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
  }
}

export async function getAdminProductsPage(query: AdminProductsQuery): Promise<{
  products: AdminProduct[]
  categories: AdminCategory[]
  totalCount: number
  totalProducts: number
  page: number
  totalPages: number
  query: AdminProductsQuery
}> {
  const supabase = await createClient()

  const [{ count: totalProducts }, { data: categoriesData }] = await Promise.all(
    [
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase
        .from('categories')
        .select('id, name, slug, parent_id')
        .order('sort_order', { ascending: true }),
    ]
  )

  const categories = (categoriesData || []) as AdminCategory[]
  const normalizedQuery: AdminProductsQuery = {
    ...query,
    category:
      query.category !== 'all' &&
      categories.some((category) => category.id === query.category)
        ? query.category
        : 'all',
  }

  const restrictedIds = await resolveRestrictedProductIds(
    supabase,
    normalizedQuery,
    categories
  )

  if (restrictedIds && restrictedIds.length === 0) {
    return {
      products: [],
      categories,
      totalCount: 0,
      totalProducts: totalProducts || 0,
      page: 1,
      totalPages: 1,
      query: { ...normalizedQuery, page: 1 },
    }
  }

  const pageSize = ADMIN_PRODUCTS_PAGE_SIZE
  const productSelect = `
    *,
    product_categories(category:categories(id, name, slug, parent_id))
  `

  const runPage = async (page: number) => {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const dbQuery = applyProductFilters(
      supabase.from('products').select(productSelect, { count: 'exact' }),
      normalizedQuery,
      restrictedIds
    )
    return dbQuery.range(from, to)
  }

  let page = normalizedQuery.page
  let { data, error, count } = await runPage(page)
  if (error) throw error

  const totalCount = count || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  if (page > totalPages && totalCount > 0) {
    page = totalPages
    const retry = await runPage(page)
    if (retry.error) throw retry.error
    data = retry.data
    count = retry.count
  }

  return {
    products: (data || []) as AdminProduct[],
    categories,
    totalCount: count || totalCount,
    totalProducts: totalProducts || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || totalCount) / pageSize)),
    query: { ...normalizedQuery, page },
  }
}
