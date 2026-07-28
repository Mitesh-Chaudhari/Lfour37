import type { SupabaseClient } from '@supabase/supabase-js'

export type VariantFilterOptions = {
  sizes?: string[]
  colors?: string[]
  inStockOnly?: boolean
}

function normalizeFilterValue(value: string): string {
  return value.trim().toLowerCase()
}

async function getProductIdsForSizeFilter(
  supabase: SupabaseClient,
  sizes: string[]
): Promise<Set<string>> {
  const { data } = await supabase
    .from('product_variants')
    .select('product_id')
    .eq('is_active', true)
    .in('size', sizes)

  return new Set(
    (data || [])
      .map((variant) => variant.product_id)
      .filter((id): id is string => Boolean(id))
  )
}

async function getProductIdsForColorFilter(
  supabase: SupabaseClient,
  colors: string[]
): Promise<Set<string>> {
  const [byGroupRes, byColorRes] = await Promise.all([
    supabase
      .from('product_variants')
      .select('product_id')
      .eq('is_active', true)
      .in('color_group', colors),
    supabase
      .from('product_variants')
      .select('product_id')
      .eq('is_active', true)
      .in('color', colors),
  ])

  const productIds = new Set<string>()

  for (const variant of [...(byGroupRes.data || []), ...(byColorRes.data || [])]) {
    if (variant.product_id) productIds.add(variant.product_id)
  }

  return productIds
}

async function getProductIdsForStockFilter(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from('product_variants')
    .select('product_id')
    .eq('is_active', true)
    .gt('stock', 0)

  return new Set(
    (data || [])
      .map((variant) => variant.product_id)
      .filter((id): id is string => Boolean(id))
  )
}

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set()
  if (sets.length === 1) return sets[0]

  return sets.reduce((acc, current) => {
    const next = new Set<string>()
    for (const id of acc) {
      if (current.has(id)) next.add(id)
    }
    return next
  })
}

/**
 * Returns product IDs that match size/color/stock variant filters.
 * - `null` → no variant filters requested
 * - `[]` → filters requested but nothing matched
 * - `string[]` → matching product IDs
 */
export async function getProductIdsMatchingVariantFilters(
  supabase: SupabaseClient,
  options: VariantFilterOptions
): Promise<string[] | null> {
  const sizes = (options.sizes || []).map(normalizeFilterValue).filter(Boolean)
  const colors = (options.colors || []).map(normalizeFilterValue).filter(Boolean)
  const inStockOnly = Boolean(options.inStockOnly)

  if (sizes.length === 0 && colors.length === 0 && !inStockOnly) {
    return null
  }

  const filterSets: Set<string>[] = []

  if (sizes.length > 0) {
    filterSets.push(await getProductIdsForSizeFilter(supabase, sizes))
  }

  if (colors.length > 0) {
    filterSets.push(await getProductIdsForColorFilter(supabase, colors))
  }

  if (inStockOnly) {
    filterSets.push(await getProductIdsForStockFilter(supabase))
  }

  if (filterSets.some((set) => set.size === 0)) {
    return []
  }

  return [...intersectSets(filterSets)]
}

export function normalizeSearchParamList(
  value: string | string[] | undefined
): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return [value]
}
