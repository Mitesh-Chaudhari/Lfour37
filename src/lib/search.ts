import type { SupabaseClient } from '@supabase/supabase-js'

export const RECENT_SEARCHES_KEY = 'lfour37_recent_searches'
export const MAX_RECENT_SEARCHES = 8

export interface SearchProductResult {
  id: string
  name: string
  slug: string
  price: number
  compare_price: number | null
  images: { url: string; alt?: string; position: number }[]
}

export interface SearchCategoryResult {
  id: string
  name: string
  slug: string
  image_url: string | null
}

export function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[,()]/g, ' ').replace(/\s+/g, ' ')
}

export function buildTextSearchOrFilter(term: string): string {
  const safe = sanitizeSearchTerm(term)
  if (!safe) return ''
  const pattern = `%${safe}%`
  return [
    `name.ilike.${pattern}`,
    `short_description.ilike.${pattern}`,
    `description.ilike.${pattern}`,
    `sku.ilike.${pattern}`,
  ].join(',')
}

export async function getProductIdsFromCategorySearch(
  supabase: SupabaseClient,
  term: string
): Promise<string[]> {
  const safe = sanitizeSearchTerm(term)
  if (!safe) return []

  const { data: categories } = await supabase
    .from('categories')
    .select('id')
    .eq('is_active', true)
    .ilike('name', `%${safe}%`)

  if (!categories?.length) return []

  const { data: links } = await supabase
    .from('product_categories')
    .select('product_id')
    .in(
      'category_id',
      categories.map((c) => c.id)
    )

  return [...new Set(links?.map((l) => l.product_id) || [])]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyProductSearchFilter(query: any, term: string, extraProductIds: string[] = []) {
  const safe = sanitizeSearchTerm(term)
  if (!safe) return query

  const textFilter = buildTextSearchOrFilter(safe)
  if (!textFilter) return query

  if (extraProductIds.length > 0) {
    return query.or(`${textFilter},id.in.(${extraProductIds.join(',')})`)
  }

  return query.or(textFilter)
}

export function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch {
    return []
  }
}

export function saveRecentSearch(term: string): void {
  if (typeof window === 'undefined') return
  const safe = sanitizeSearchTerm(term)
  if (!safe) return

  const recent = getRecentSearches().filter(
    (item) => item.toLowerCase() !== safe.toLowerCase()
  )
  recent.unshift(safe)
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT_SEARCHES))
  )
}

export function removeRecentSearch(term: string): void {
  if (typeof window === 'undefined') return
  const recent = getRecentSearches().filter((item) => item !== term)
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent))
}

export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(RECENT_SEARCHES_KEY)
}
