import { stableSearchParamsKey } from '@/lib/api/client'

export const queryKeys = {
  heroSlides: ['hero-slides'] as const,
  pincode: (code: string) => ['pincode', code] as const,
  search: (q: string) => ['search', q] as const,
  productsByIds: (ids: string[]) =>
    ['products', 'by-ids', [...ids].sort().join(',')] as const,
  productsInfinite: (searchParams: Record<string, unknown>) =>
    ['products', 'infinite', stableSearchParamsKey(searchParams)] as const,
}
