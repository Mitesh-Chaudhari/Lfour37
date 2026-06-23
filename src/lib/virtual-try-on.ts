import type { Product } from '@/types'

const EXCLUDED_CATEGORY_TERMS = ['jeans', 'trousers', 'pants']

type ProductCategoryLink = {
  category?: {
    name?: string | null
    slug?: string | null
  } | null
}

function matchesExcludedCategory(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false

  return EXCLUDED_CATEGORY_TERMS.some(
    (term) => normalized === term || normalized.includes(term)
  )
}

export function isVirtualTryOnEnabled(product: Product): boolean {
  const categories = (product.categories ?? []) as ProductCategoryLink[]

  return !categories.some((entry) => {
    const category = entry.category
    if (!category) return false

    return (
      matchesExcludedCategory(category.name ?? '') ||
      matchesExcludedCategory(category.slug ?? '')
    )
  })
}
