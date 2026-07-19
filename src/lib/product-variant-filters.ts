import type { SupabaseClient } from '@supabase/supabase-js'

export type VariantFilterOptions = {
  sizes?: string[]
  colors?: string[]
  inStockOnly?: boolean
}

function normalizeFilterValue(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Returns product IDs that match size/color/stock variant filters.
 * - `null` → no variant filters requested
 * - `[]` → filters requested but nothing matched
 * - `string[]` → matching product IDs
 *
 * Filtering must happen before product pagination; applying it after
 * `.range()` incorrectly drops matching products that fall outside the page.
 *
 * Size / color / stock are applied independently at product level
 * (same behavior as the previous in-memory filters).
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

  const { data, error } = await supabase
    .from('product_variants')
    .select('product_id, size, color_group, color, stock, is_active')
    .eq('is_active', true)

  if (error || !data) {
    return []
  }

  const sizeSet = new Set(sizes)
  const colorSet = new Set(colors)

  const byProduct = new Map<
    string,
    { hasSize: boolean; hasColor: boolean; hasStock: boolean }
  >()

  for (const variant of data) {
    if (!variant.product_id) continue

    const current = byProduct.get(variant.product_id) || {
      hasSize: sizeSet.size === 0,
      hasColor: colorSet.size === 0,
      hasStock: !inStockOnly,
    }

    if (sizeSet.size > 0) {
      const size = normalizeFilterValue(variant.size || '')
      if (sizeSet.has(size)) current.hasSize = true
    }

    if (colorSet.size > 0) {
      const colorGroup = normalizeFilterValue(variant.color_group || '')
      const colorName = normalizeFilterValue(variant.color || '')
      // Prefer filter color (color_group); fall back to product color name.
      if (colorSet.has(colorGroup) || colorSet.has(colorName)) {
        current.hasColor = true
      }
    }

    if (inStockOnly && Number(variant.stock) > 0) {
      current.hasStock = true
    }

    byProduct.set(variant.product_id, current)
  }

  return [...byProduct.entries()]
    .filter(([, flags]) => flags.hasSize && flags.hasColor && flags.hasStock)
    .map(([productId]) => productId)
}

export function normalizeSearchParamList(
  value: string | string[] | undefined
): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return [value]
}
