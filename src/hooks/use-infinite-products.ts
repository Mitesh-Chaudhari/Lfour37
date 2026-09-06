'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { appendSearchParams, apiGet } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'

export interface ProductsPage {
  products: any[]
  total?: number
  page: number
  hasMore: boolean
}

async function fetchProductsPage(
  searchParams: Record<string, unknown>,
  page: number
): Promise<ProductsPage> {
  const params = new URLSearchParams()
  appendSearchParams(params, searchParams)
  params.set('page', String(page))

  const data = await apiGet<ProductsPage>(`/api/products?${params.toString()}`)
  return {
    products: data.products || [],
    total: data.total,
    page: data.page ?? page,
    hasMore: Boolean(data.hasMore),
  }
}

/**
 * Infinite product listing. Page 1 comes from SSR `initialProducts`;
 * subsequent pages load via React Query.
 */
export function useInfiniteProducts(
  initialProducts: any[],
  searchParams: Record<string, unknown>
) {
  const hasInitial = initialProducts.length > 0

  return useInfiniteQuery({
    queryKey: queryKeys.productsInfinite(searchParams),
    queryFn: ({ pageParam }) => fetchProductsPage(searchParams, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialData: hasInitial
      ? {
          pages: [
            {
              products: initialProducts,
              page: 1,
              hasMore: initialProducts.length >= 16,
            },
          ],
          pageParams: [1],
        }
      : undefined,
    initialDataUpdatedAt: hasInitial ? Date.now() : undefined,
    staleTime: 60 * 1000,
    refetchOnMount: false,
  })
}
