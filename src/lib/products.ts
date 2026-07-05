import type { SupabaseClient } from '@supabase/supabase-js'

/** Share of top-selling active products that receive the Best Seller badge. */
const BEST_SELLER_TOP_PERCENT = 0.2
const BEST_SELLER_MAX_COUNT = 30
const BEST_SELLER_MIN_COUNT = 1

export async function getBestSellerProductIds(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from('products')
    .select('id, total_sold')
    .eq('status', 'active')
    .gt('total_sold', 0)
    .order('total_sold', { ascending: false })

  if (!data?.length) return new Set()

  const count = Math.min(
    BEST_SELLER_MAX_COUNT,
    Math.max(BEST_SELLER_MIN_COUNT, Math.ceil(data.length * BEST_SELLER_TOP_PERCENT))
  )

  return new Set(data.slice(0, count).map((product) => product.id))
}

export function enrichProductsWithBestSeller<T extends { id: string }>(
  products: T[],
  bestSellerIds: Set<string>
): Array<T & { is_best_seller: boolean }> {
  return products.map((product) => ({
    ...product,
    is_best_seller: bestSellerIds.has(product.id),
  }))
}

/** Whether admin listing priority should apply before the selected customer sort. */
export function shouldApplyListSortOrder(sortBy?: string | null): boolean {
  return !sortBy || sortBy === 'newest'
}
