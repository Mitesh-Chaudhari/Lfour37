/** Purchase (cost) price from MRP/compare_price + apparel category. */

export type PurchasePriceKind = 'tshirt_shirt' | 'jeans_trousers'

export interface CategoryNameSlug {
  id: string
  name: string
  slug?: string | null
  parent_id?: string | null
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Detect formula kind from a category name, slug, or product title. Shirt is checked after t-shirt. */
export function detectPurchasePriceKind(
  nameOrSlug: string
): PurchasePriceKind | null {
  const label = normalizeLabel(nameOrSlug)
  if (!label) return null

  if (
    /\bt[\s-]?shirts?\b/.test(label) ||
    /\btees?\b/.test(label) ||
    label === 'tshirt' ||
    label === 'tshirts'
  ) {
    return 'tshirt_shirt'
  }

  if (/\bsweat[\s-]?shirts?\b/.test(label) || label === 'sweatshirt' || label === 'sweatshirts') {
    return 'tshirt_shirt'
  }

  if (/\bshirts?\b/.test(label)) {
    return 'tshirt_shirt'
  }

  if (/\bjeans?\b/.test(label)) {
    return 'jeans_trousers'
  }

  if (/\btrousers?\b/.test(label) || /\bpants?\b/.test(label)) {
    return 'jeans_trousers'
  }

  return null
}

export function computePurchasePrice(
  comparePrice: number | null | undefined,
  kind: PurchasePriceKind | null
): number | null {
  if (kind == null) return null
  if (comparePrice == null || !Number.isFinite(comparePrice) || comparePrice <= 0) {
    return null
  }

  const half = comparePrice / 2
  const raw = kind === 'tshirt_shirt' ? half - 200 : half
  const rounded = Math.round(raw * 100) / 100
  return rounded >= 0 ? rounded : 0
}

/**
 * Resolve purchase price from selected category ids + compare_price.
 * Prefers deepest matching category in the tree.
 */
export function resolvePurchasePriceFromCategories(
  comparePrice: number | null | undefined,
  categoryIds: string[],
  categories: CategoryNameSlug[]
): number | null {
  if (!categoryIds.length) return null

  const byId = new Map(categories.map((c) => [c.id, c]))

  const depth = (id: string): number => {
    let d = 0
    let current: string | null = id
    while (current) {
      const parent = byId.get(current)?.parent_id ?? null
      if (!parent) break
      d++
      current = parent
    }
    return d
  }

  const sorted = [...categoryIds].sort((a, b) => depth(b) - depth(a))

  for (const id of sorted) {
    let current: string | null = id
    while (current) {
      const cat = byId.get(current)
      if (!cat) break
      const kind =
        detectPurchasePriceKind(cat.name) ||
        detectPurchasePriceKind(cat.slug || '')
      const price = computePurchasePrice(comparePrice, kind)
      if (price != null) return price
      current = cat.parent_id ?? null
    }
  }

  return null
}

export type PurchasePriceProductInput = {
  cost_price?: number | null
  compare_price?: number | null
  name?: string | null
  categories?: Array<{
    category?: CategoryNameSlug | CategoryNameSlug[] | null
  } | null> | null
}

/** Prefer saved cost_price; else compute from compare_price + categories / product name. */
export function resolveItemPurchasePrice(
  product: PurchasePriceProductInput | null | undefined,
  productNameFallback?: string | null
): number | null {
  if (!product && !productNameFallback) return null

  const saved = product?.cost_price
  if (saved != null && Number.isFinite(saved) && saved > 0) {
    return saved
  }

  const comparePrice = product?.compare_price
  const categoryRows = product?.categories || []
  const categories: CategoryNameSlug[] = []
  const categoryIds: string[] = []

  for (const row of categoryRows) {
    const cat = Array.isArray(row?.category) ? row.category[0] : row?.category
    if (!cat?.id) continue
    categories.push({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parent_id: cat.parent_id ?? null,
    })
    categoryIds.push(cat.id)
  }

  const fromCategories = resolvePurchasePriceFromCategories(
    comparePrice,
    categoryIds,
    categories
  )
  if (fromCategories != null) return fromCategories

  const title = product?.name || productNameFallback || ''
  return computePurchasePrice(comparePrice, detectPurchasePriceKind(title))
}
