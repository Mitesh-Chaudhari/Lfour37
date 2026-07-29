import type { SupabaseClient } from '@supabase/supabase-js'

export type VariantFilterOptions = {
  sizes?: string[]
  colors?: string[]
  inStockOnly?: boolean
}

function normalizeFilterValue(value: string): string {
  return value.trim().toLowerCase()
}

function uniqueTrimmed(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ]
}

/**
 * Case-insensitive size match. Keeps original URL/UI values for exact `.in()`,
 * and also compares normalized values in memory so "m" matches "M".
 */
async function getProductIdsForSizeFilter(
  supabase: SupabaseClient,
  sizes: string[]
): Promise<Set<string>> {
  const sizeSet = new Set(sizes.map(normalizeFilterValue))

  const { data, error } = await supabase
    .from('product_variants')
    .select('product_id, size')
    .eq('is_active', true)

  if (error || !data) return new Set()

  const productIds = new Set<string>()
  for (const variant of data) {
    if (!variant.product_id) continue
    if (sizeSet.has(normalizeFilterValue(variant.size || ''))) {
      productIds.add(variant.product_id)
    }
  }

  return productIds
}

/**
 * Match against both `color_group` (filter chips) and `color` (variant name),
 * case-insensitively. The previous `.in(color_group, lowercased)` path failed
 * because DB values are typically "Black" while the query used "black".
 */
async function getProductIdsForColorFilter(
  supabase: SupabaseClient,
  colors: string[]
): Promise<Set<string>> {
  const colorSet = new Set(colors.map(normalizeFilterValue))

  const { data, error } = await supabase
    .from('product_variants')
    .select('product_id, color_group, color')
    .eq('is_active', true)

  if (error || !data) return new Set()

  const productIds = new Set<string>()
  for (const variant of data) {
    if (!variant.product_id) continue

    const colorGroup = normalizeFilterValue(variant.color_group || '')
    const colorName = normalizeFilterValue(variant.color || '')

    if (colorSet.has(colorGroup) || colorSet.has(colorName)) {
      productIds.add(variant.product_id)
    }
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
 *
 * Size / color / stock are applied independently at product level (AND across
 * filter types, OR within a filter type). Multi-select sizes/colors use OR.
 */
export async function getProductIdsMatchingVariantFilters(
  supabase: SupabaseClient,
  options: VariantFilterOptions
): Promise<string[] | null> {
  const sizes = uniqueTrimmed(options.sizes || [])
  const colors = uniqueTrimmed(options.colors || [])
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
