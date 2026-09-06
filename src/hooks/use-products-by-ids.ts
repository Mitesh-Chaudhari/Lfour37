'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { ListingProduct } from '@/lib/catalog-queries'

interface ProductsByIdsResponse {
  products: ListingProduct[]
}

/**
 * Fetch listing products by id list (e.g. recently viewed).
 * Preserves API order when the server returns ordered products.
 */
export function useProductsByIds(ids: string[]) {
  const normalized = [...new Set(ids.filter(Boolean))].slice(0, 12)

  return useQuery({
    queryKey: queryKeys.productsByIds(normalized),
    queryFn: async () => {
      const res = await apiGet<ProductsByIdsResponse>(
        `/api/products/by-ids?ids=${encodeURIComponent(normalized.join(','))}`
      )
      return res.products || []
    },
    enabled: normalized.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}
