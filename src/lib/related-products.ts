import type { SupabaseClient } from '@supabase/supabase-js'
import { LISTING_PRODUCT_SELECT, type ListingProduct } from '@/lib/catalog-queries'
import {
  getCategoryPath,
  getDeepestCategoryId,
  type CategoryRef,
} from '@/lib/categories'

const RELATED_LIMIT = 8
const CANDIDATE_LIMIT = 40

type RelatedCandidate = ListingProduct & {
  total_sold?: number | null
  categories?: Array<{
    category_id?: string
    category?: CategoryRef | null
  }> | null
}

type ApparelType =
  | 'tshirt'
  | 'shirt'
  | 'jeans'
  | 'trouser'
  | 'shorts'
  | 'hoodie'
  | 'sweatshirt'
  | 'jacket'
  | 'kurta'
  | 'dress'
  | 'skirt'
  | 'top'
  | 'cargo'

const APPAREL_RULES: Array<{ type: ApparelType; pattern: RegExp }> = [
  { type: 'tshirt', pattern: /\bt[\s-]?shirts?\b|\btees?\b/i },
  { type: 'shirt', pattern: /\bshirts?\b/i },
  { type: 'jeans', pattern: /\bjeans\b/i },
  { type: 'trouser', pattern: /\btrousers?\b|\bpants?\b|\bchinos?\b/i },
  { type: 'shorts', pattern: /\bshorts?\b/i },
  { type: 'hoodie', pattern: /\bhoodies?\b/i },
  { type: 'sweatshirt', pattern: /\bsweatshirts?\b/i },
  { type: 'jacket', pattern: /\bjackets?\b|\bblazers?\b/i },
  { type: 'kurta', pattern: /\bkurtas?\b/i },
  { type: 'dress', pattern: /\bdresses?\b/i },
  { type: 'skirt', pattern: /\bskirts?\b/i },
  { type: 'cargo', pattern: /\bcargos?\b/i },
  { type: 'top', pattern: /\btops?\b/i },
]

export function inferApparelType(
  productName: string,
  categoryNames: string[] = []
): ApparelType | null {
  const haystack = `${categoryNames.join(' ')} ${productName}`.toLowerCase()
  for (const rule of APPAREL_RULES) {
    if (rule.pattern.test(haystack)) return rule.type
  }
  return null
}

function candidateCategoryIds(product: RelatedCandidate): string[] {
  return (product.categories || [])
    .map((row) => row.category?.id || row.category_id)
    .filter((id): id is string => Boolean(id))
}

function scoreRelatedProduct(options: {
  candidate: RelatedCandidate
  deepestCategoryId: string | null
  parentCategoryId: string | null
  currentPrice: number
  currentType: ApparelType | null
  allCategories: CategoryRef[]
}): number {
  const {
    candidate,
    deepestCategoryId,
    parentCategoryId,
    currentPrice,
    currentType,
    allCategories,
  } = options

  const ids = new Set(candidateCategoryIds(candidate))
  let score = 0

  if (deepestCategoryId && ids.has(deepestCategoryId)) {
    score += 120
  } else if (parentCategoryId && ids.has(parentCategoryId)) {
    score += 35
  }

  const candidateType = inferApparelType(
    candidate.name,
    (candidate.categories || [])
      .map((row) => row.category?.name)
      .filter((name): name is string => Boolean(name))
  )

  if (currentType && candidateType) {
    if (currentType === candidateType) score += 80
    else score -= 100
  }

  if (currentPrice > 0 && candidate.price > 0) {
    const ratio = Math.abs(candidate.price - currentPrice) / currentPrice
    if (ratio <= 0.25) score += 25
    else if (ratio <= 0.5) score += 12
    else if (ratio <= 1) score += 4
    else score -= 8
  }

  score += Math.min(20, Number(candidate.total_sold || 0) / 5)
  score += Math.min(10, Number(candidate.average_rating || 0) * 2)

  // Prefer products that share the deepest leaf over broad parents.
  if (deepestCategoryId) {
    const deepest = allCategories.find((c) => c.id === deepestCategoryId)
    if (deepest?.name) {
      const leaf = deepest.name.toLowerCase()
      if (candidate.name.toLowerCase().includes(leaf.replace(/s$/, ''))) {
        score += 8
      }
    }
  }

  return score
}

async function fetchCategoryCandidates(
  supabase: SupabaseClient,
  categoryIds: string[],
  excludeProductId: string,
  limit: number
): Promise<RelatedCandidate[]> {
  if (!categoryIds.length) return []

  const { data } = await supabase
    .from('products')
    .select(
      `
      ${LISTING_PRODUCT_SELECT},
      total_sold,
      categories:product_categories!inner(
        category_id,
        category:categories(id, name, slug, parent_id)
      )
    `
    )
    .eq('status', 'active')
    .in('product_categories.category_id', categoryIds)
    .neq('id', excludeProductId)
    .order('total_sold', { ascending: false })
    .limit(limit)

  return (data as RelatedCandidate[] | null) || []
}

/**
 * Myntra/Ajio-style related products:
 * prefer same leaf category + same apparel type, then fill from nearby categories.
 */
export async function getRelatedProducts(options: {
  supabase: SupabaseClient
  productId: string
  productName: string
  productPrice: number
  productCategoryIds: string[]
  allCategories: CategoryRef[]
  limit?: number
}): Promise<ListingProduct[]> {
  const {
    supabase,
    productId,
    productName,
    productPrice,
    productCategoryIds,
    allCategories,
    limit = RELATED_LIMIT,
  } = options

  if (!productCategoryIds.length) return []

  const deepestCategoryId = getDeepestCategoryId(
    productCategoryIds,
    allCategories
  )
  const path = deepestCategoryId
    ? getCategoryPath(deepestCategoryId, allCategories)
    : []
  const deepest = path[path.length - 1] || null
  const parent = path.length > 1 ? path[path.length - 2] : null

  const currentType = inferApparelType(
    productName,
    path.map((category) => category.name)
  )

  const primaryIds = deepestCategoryId ? [deepestCategoryId] : productCategoryIds
  const fallbackIds = [
    ...new Set(
      [
        parent?.id,
        // Sibling leaves under the same parent (e.g. Shirts / Casual Shirts)
        ...allCategories
          .filter(
            (category) =>
              parent?.id &&
              category.parent_id === parent.id &&
              category.id !== deepestCategoryId
          )
          .map((category) => category.id),
      ].filter((id): id is string => Boolean(id))
    ),
  ]

  const [primary, fallback] = await Promise.all([
    fetchCategoryCandidates(supabase, primaryIds, productId, CANDIDATE_LIMIT),
    fallbackIds.length
      ? fetchCategoryCandidates(
          supabase,
          fallbackIds,
          productId,
          CANDIDATE_LIMIT
        )
      : Promise.resolve([] as RelatedCandidate[]),
  ])

  const byId = new Map<string, RelatedCandidate>()
  for (const product of [...primary, ...fallback]) {
    if (product.id === productId) continue
    if (!byId.has(product.id)) byId.set(product.id, product)
  }

  const ranked = [...byId.values()]
    .map((candidate) => ({
      candidate,
      score: scoreRelatedProduct({
        candidate,
        deepestCategoryId,
        parentCategoryId: parent?.id || null,
        currentPrice: productPrice,
        currentType,
        allCategories,
      }),
    }))
    .filter(({ score, candidate }) => {
      if (!currentType) return score > 0
      const candidateType = inferApparelType(
        candidate.name,
        (candidate.categories || [])
          .map((row) => row.category?.name)
          .filter((name): name is string => Boolean(name))
      )
      // Keep same-type matches; allow untyped catalog items only from leaf category.
      if (candidateType && candidateType !== currentType) return false
      return score > 0
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ candidate }) => {
      const { total_sold: _sold, categories: _cats, ...listing } = candidate
      return listing as ListingProduct
    })

  // If type filtering left us short, refill from leaf-category matches only.
  if (ranked.length < Math.min(4, limit) && deepestCategoryId) {
    const existing = new Set(ranked.map((p) => p.id))
    for (const candidate of primary) {
      if (existing.has(candidate.id) || candidate.id === productId) continue
      const { total_sold: _sold, categories: _cats, ...listing } = candidate
      ranked.push(listing as ListingProduct)
      existing.add(candidate.id)
      if (ranked.length >= limit) break
    }
  }

  return ranked.slice(0, limit)
}

export function relatedProductsViewAllHref(
  deepestCategorySlug?: string | null
): string | undefined {
  if (!deepestCategorySlug) return undefined
  return `/products?category=${encodeURIComponent(deepestCategorySlug)}`
}
