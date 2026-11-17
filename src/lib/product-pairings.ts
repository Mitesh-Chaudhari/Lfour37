import type { SupabaseClient } from '@supabase/supabase-js'
import { LISTING_PRODUCT_SELECT, type ListingProduct } from '@/lib/catalog-queries'
import { inferApparelType } from '@/lib/related-products'

export const PAIRING_LIMIT = 4

type ApparelType = NonNullable<ReturnType<typeof inferApparelType>>

type PairingCandidate = ListingProduct & {
  brand_id?: string | null
  total_sold?: number | null
  categories?: Array<{
    category_id?: string
    category?: { id: string; name: string; slug: string; parent_id: string | null } | null
  }> | null
}

const TOP_TYPES: ApparelType[] = [
  'tshirt',
  'shirt',
  'hoodie',
  'sweatshirt',
  'jacket',
  'kurta',
  'top',
]

const BOTTOM_TYPES: ApparelType[] = [
  'jeans',
  'trouser',
  'shorts',
  'cargo',
  'skirt',
]

function isTop(type: ApparelType | null): boolean {
  return Boolean(type && TOP_TYPES.includes(type))
}

function isBottom(type: ApparelType | null): boolean {
  return Boolean(type && BOTTOM_TYPES.includes(type))
}

/** Complementary apparel types for Complete the look fallback. */
export function complementaryApparelTypes(
  type: ApparelType | null
): ApparelType[] {
  if (!type) return []
  if (isTop(type)) return [...BOTTOM_TYPES]
  if (isBottom(type)) return [...TOP_TYPES]
  if (type === 'dress') return [...BOTTOM_TYPES, ...TOP_TYPES]
  return []
}

export function pairingSubtitle(
  productName: string,
  categoryNames: string[] = []
): string | undefined {
  const type = inferApparelType(productName, categoryNames)
  if (!type) return undefined
  if (isTop(type)) return 'Pants and bottoms that work with this look'
  if (isBottom(type)) return 'Tops that complete this look'
  return 'Pieces that complete this look'
}

function isProductInStock(product: PairingCandidate): boolean {
  const variants = product.variants || []
  if (!variants.length) return false
  return variants.some(
    (variant) => variant.is_active !== false && (variant.stock ?? 0) > 0
  )
}

function categoryNamesOf(product: PairingCandidate): string[] {
  return (product.categories || [])
    .map((row) => row.category?.name)
    .filter((name): name is string => Boolean(name))
}

function scorePairCandidate(options: {
  candidate: PairingCandidate
  currentPrice: number
  wantedTypes: ApparelType[]
}): number {
  const { candidate, currentPrice, wantedTypes } = options
  const candidateType = inferApparelType(candidate.name, categoryNamesOf(candidate))
  let score = 0

  if (candidateType && wantedTypes.includes(candidateType)) score += 100
  else if (candidateType) score -= 80

  if (currentPrice > 0 && candidate.price > 0) {
    const ratio = Math.abs(candidate.price - currentPrice) / currentPrice
    if (ratio <= 0.25) score += 30
    else if (ratio <= 0.5) score += 15
    else if (ratio <= 1) score += 5
    else score -= 10
  }

  score += Math.min(20, Number(candidate.total_sold || 0) / 5)
  score += Math.min(10, Number(candidate.average_rating || 0) * 2)
  return score
}

function toListing(product: PairingCandidate): ListingProduct {
  const {
    total_sold: _sold,
    categories: _cats,
    brand_id: _brand,
    ...listing
  } = product
  return listing as ListingProduct
}

async function fetchProductsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<PairingCandidate[]> {
  if (!ids.length) return []
  const { data } = await supabase
    .from('products')
    .select(
      `
      ${LISTING_PRODUCT_SELECT},
      brand_id,
      total_sold,
      categories:product_categories(
        category_id,
        category:categories(id, name, slug, parent_id)
      )
    `
    )
    .in('id', ids)
    .eq('status', 'active')

  return (data as PairingCandidate[] | null) || []
}

async function fetchAutoPairCandidates(options: {
  supabase: SupabaseClient
  excludeIds: string[]
  brandId?: string | null
  limit: number
}): Promise<PairingCandidate[]> {
  const { supabase, excludeIds, brandId, limit } = options
  let query = supabase
    .from('products')
    .select(
      `
      ${LISTING_PRODUCT_SELECT},
      brand_id,
      total_sold,
      categories:product_categories(
        category_id,
        category:categories(id, name, slug, parent_id)
      )
    `
    )
    .eq('status', 'active')
    .order('total_sold', { ascending: false })
    .limit(Math.max(limit * 4, 40))

  if (brandId) {
    query = query.eq('brand_id', brandId)
  }

  const { data } = await query
  const exclude = new Set(excludeIds)
  return ((data as PairingCandidate[] | null) || []).filter(
    (product) => !exclude.has(product.id) && isProductInStock(product)
  )
}

/**
 * Hybrid Complete the look:
 * 1) Admin-curated pairs (ordered, in stock)
 * 2) Auto fill with complementary top↔bottom apparel
 */
export async function getCompleteTheLookProducts(options: {
  supabase: SupabaseClient
  productId: string
  productName: string
  productPrice: number
  productCategoryNames?: string[]
  brandId?: string | null
  limit?: number
}): Promise<{ products: ListingProduct[]; subtitle?: string }> {
  const {
    supabase,
    productId,
    productName,
    productPrice,
    productCategoryNames = [],
    brandId,
    limit = PAIRING_LIMIT,
  } = options

  const subtitle = pairingSubtitle(productName, productCategoryNames)
  const currentType = inferApparelType(productName, productCategoryNames)
  const wantedTypes = complementaryApparelTypes(currentType)

  const { data: pairingRows } = await supabase
    .from('product_pairings')
    .select('paired_product_id, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .limit(limit)

  const curatedIds = (pairingRows || []).map((row) =>
    String(row.paired_product_id)
  )

  const curatedProducts = await fetchProductsByIds(supabase, curatedIds)
  const curatedById = new Map(curatedProducts.map((p) => [p.id, p]))
  const selected: ListingProduct[] = []
  const selectedIds = new Set<string>([productId])

  for (const id of curatedIds) {
    if (selected.length >= limit) break
    const product = curatedById.get(id)
    if (!product || !isProductInStock(product)) continue
    if (selectedIds.has(product.id)) continue
    selected.push(toListing(product))
    selectedIds.add(product.id)
  }

  if (selected.length < limit && wantedTypes.length > 0) {
    const autoCandidates = await fetchAutoPairCandidates({
      supabase,
      excludeIds: [...selectedIds],
      brandId,
      limit,
    })

    const ranked = autoCandidates
      .map((candidate) => ({
        candidate,
        score: scorePairCandidate({
          candidate,
          currentPrice: productPrice,
          wantedTypes,
        }),
      }))
      .filter(({ candidate, score }) => {
        const type = inferApparelType(
          candidate.name,
          categoryNamesOf(candidate)
        )
        return Boolean(type && wantedTypes.includes(type) && score > 0)
      })
      .sort((a, b) => b.score - a.score)

    for (const { candidate } of ranked) {
      if (selected.length >= limit) break
      if (selectedIds.has(candidate.id)) continue
      selected.push(toListing(candidate))
      selectedIds.add(candidate.id)
    }
  }

  return { products: selected, subtitle }
}

export type AdminPairingProduct = {
  id: string
  name: string
  slug: string
  images: ListingProduct['images']
  price: number
  status: string
}

export async function getAdminPairingOptions(
  supabase: SupabaseClient,
  options: { brandId?: string | null; excludeProductId?: string | null } = {}
): Promise<AdminPairingProduct[]> {
  let query = supabase
    .from('products')
    .select('id, name, slug, images, price, status')
    .in('status', ['active', 'draft'])
    .order('name')
    .limit(300)

  if (options.brandId) {
    query = query.eq('brand_id', options.brandId)
  }
  if (options.excludeProductId) {
    query = query.neq('id', options.excludeProductId)
  }

  const { data } = await query
  return (data as AdminPairingProduct[] | null) || []
}

export async function getCuratedPairingIds(
  supabase: SupabaseClient,
  productId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('product_pairings')
    .select('paired_product_id, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .limit(PAIRING_LIMIT)

  return (data || []).map((row) => String(row.paired_product_id))
}

export async function saveProductPairings(
  supabase: SupabaseClient,
  productId: string,
  pairedProductIds: string[]
): Promise<void> {
  const unique = [
    ...new Set(
      pairedProductIds
        .map((id) => id.trim())
        .filter((id) => id && id !== productId)
    ),
  ].slice(0, PAIRING_LIMIT)

  const { error: deleteError } = await supabase
    .from('product_pairings')
    .delete()
    .eq('product_id', productId)
  if (deleteError) throw deleteError

  if (!unique.length) return

  const { error: insertError } = await supabase.from('product_pairings').insert(
    unique.map((paired_product_id, index) => ({
      product_id: productId,
      paired_product_id,
      sort_order: index,
    }))
  )
  if (insertError) throw insertError
}
