'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { HeroSlide } from '@/lib/hero-slides'

/**
 * Active homepage hero slides.
 * Prefer passing `initialData` from the server to avoid a loading flash.
 */
export function useHeroSlides(options?: {
  initialData?: HeroSlide[]
  enabled?: boolean
}) {
  const hasInitial = (options?.initialData?.length ?? 0) > 0

  return useQuery({
    queryKey: queryKeys.heroSlides,
    queryFn: () => apiGet<HeroSlide[]>('/api/hero-slides'),
    enabled: options?.enabled ?? true,
    initialData: hasInitial ? options?.initialData : undefined,
    initialDataUpdatedAt: hasInitial ? Date.now() : undefined,
    staleTime: 5 * 60 * 1000,
    // If SSR provided slides, skip an immediate client refetch.
    refetchOnMount: hasInitial ? false : true,
  })
}
