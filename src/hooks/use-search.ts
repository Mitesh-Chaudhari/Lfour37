'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type {
  SearchCategoryResult,
  SearchProductResult,
} from '@/lib/search'

export interface SearchResponse {
  products: SearchProductResult[]
  categories: SearchCategoryResult[]
  trending?: string[]
  query?: string
}

const EMPTY_SEARCH: SearchResponse = {
  products: [],
  categories: [],
  trending: [],
}

/**
 * Debounced search suggestions / trending (empty query).
 * Pass an already-debounced `q` from the caller.
 */
export function useSearch(q: string, options?: { enabled?: boolean }) {
  const term = q.trim()
  const enabled = options?.enabled ?? true

  return useQuery({
    queryKey: queryKeys.search(term),
    queryFn: async () => {
      const url = term
        ? `/api/search?q=${encodeURIComponent(term)}`
        : '/api/search'
      return apiGet<SearchResponse>(url)
    },
    enabled,
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH,
  })
}
