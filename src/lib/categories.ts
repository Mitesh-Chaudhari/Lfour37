import type { Category } from '@/types'

export interface CategoryRef {
  id: string
  name: string
  slug?: string
  parent_id: string | null
}

export interface CategorySectionGroup {
  section: Category
  items: Category[]
}

type ProductCategoryJoin =
  | { category?: CategoryRef | null }
  | CategoryRef

export function buildCategoryTree<T extends CategoryRef>(
  categories: T[]
): Array<T & { children: Array<T & { children: never[] }> }> {
  const map = new Map<string, T & { children: Array<T & { children: never[] }> }>()
  const roots: Array<T & { children: Array<T & { children: never[] }> }> = []

  categories.forEach((category) => {
    map.set(category.id, { ...category, children: [] })
  })

  categories.forEach((category) => {
    const node = map.get(category.id)!
    if (category.parent_id) {
      map.get(category.parent_id)?.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

export function getCategoryDepth(
  categoryId: string,
  categories: CategoryRef[]
): number {
  const byId = new Map(categories.map((category) => [category.id, category]))
  let depth = 0
  let current: string | null = categoryId

  while (current) {
    const category = byId.get(current)
    if (!category?.parent_id) break
    depth++
    current = category.parent_id
  }

  return depth
}

/** All descendant category IDs, optionally including the root category itself. */
export function getCategoryDescendantIds(
  categoryId: string,
  categories: CategoryRef[],
  includeSelf = true
): string[] {
  const childrenByParent = new Map<string, string[]>()

  for (const category of categories) {
    if (!category.parent_id) continue
    const siblings = childrenByParent.get(category.parent_id) || []
    siblings.push(category.id)
    childrenByParent.set(category.parent_id, siblings)
  }

  const result: string[] = includeSelf ? [categoryId] : []
  const stack = [...(childrenByParent.get(categoryId) || [])]

  while (stack.length > 0) {
    const id = stack.pop()!
    result.push(id)
    const children = childrenByParent.get(id)
    if (children?.length) {
      stack.push(...children)
    }
  }

  return result
}

/** Keep only the most specific categories from a checkbox selection. */
export function getDeepestSelectedCategoryIds(
  selectedIds: string[],
  categories: CategoryRef[]
): string[] {
  const selected = new Set(selectedIds)

  return selectedIds.filter((id) => {
    const descendants = getCategoryDescendantIds(id, categories, false)
    return !descendants.some((descendantId) => selected.has(descendantId))
  })
}

export function getDeepestCategoryId(
  categoryIds: string[],
  categories: CategoryRef[]
): string | null {
  if (!categoryIds.length) return null

  return [...categoryIds].sort(
    (a, b) => getCategoryDepth(b, categories) - getCategoryDepth(a, categories)
  )[0]
}

export function getCategoryPathLabel(
  categoryId: string,
  categories: CategoryRef[]
): string {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const parts: string[] = []
  let current: string | null = categoryId

  while (current) {
    const category = byId.get(current)
    if (!category) break
    parts.unshift(category.name)
    current = category.parent_id
  }

  return parts.join(' > ')
}

export function getCategoryPath(
  categoryId: string,
  categories: CategoryRef[]
): CategoryRef[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const path: CategoryRef[] = []
  let current: string | null = categoryId

  while (current) {
    const category = byId.get(current)
    if (!category) break
    path.unshift(category)
    current = category.parent_id
  }

  return path
}

export function extractCategoryIdsFromProduct(
  productCategories?: ProductCategoryJoin[] | null
): string[] {
  if (!productCategories?.length) return []

  return productCategories
    .map((row) => ('category' in row ? row.category?.id : row.id))
    .filter((id): id is string => Boolean(id))
}

export function getProductCategoryPathLabel(
  productCategories: ProductCategoryJoin[] | null | undefined,
  allCategories: CategoryRef[]
): string | null {
  const ids = extractCategoryIdsFromProduct(productCategories)
  const deepest = getDeepestCategoryId(ids, allCategories)
  return deepest ? getCategoryPathLabel(deepest, allCategories) : null
}

export function getProductCategorySlug(
  productCategories: ProductCategoryJoin[] | null | undefined,
  allCategories: CategoryRef[]
): string | null {
  const ids = extractCategoryIdsFromProduct(productCategories)
  const deepest = getDeepestCategoryId(ids, allCategories)
  if (!deepest) return null

  const byId = new Map(allCategories.map((category) => [category.id, category]))
  return byId.get(deepest)?.slug ?? null
}

export function enrichProductsWithCategoryDisplay<
  T extends { categories?: ProductCategoryJoin[] | null },
>(products: T[], allCategories: CategoryRef[]) {
  return products.map((product) => ({
    ...product,
    primary_category_label:
      getProductCategoryPathLabel(product.categories, allCategories) ?? undefined,
    primary_category_slug:
      getProductCategorySlug(product.categories, allCategories) ?? undefined,
  }))
}

export function getSortedCategoryChildren(
  parentId: string,
  categories: Category[]
): Category[] {
  return categories
    .filter((category) => category.parent_id === parentId && category.is_active !== false)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/**
 * Builds drawer sections such as Topswear / Bottomswear with leaf categories beneath.
 * Supports both:
 * - Men → Topswear → T-shirts
 * - Men → Clothing → Topswear → T-shirts
 */
export function getCategorySectionGroups(
  rootId: string,
  categories: Category[]
): CategorySectionGroup[] {
  const groups: CategorySectionGroup[] = []
  const secondLevel = getSortedCategoryChildren(rootId, categories)

  for (const node of secondLevel) {
    const children = getSortedCategoryChildren(node.id, categories)

    if (children.length === 0) {
      groups.push({ section: node, items: [node] })
      continue
    }

    const hasNestedSections = children.some(
      (child) => getSortedCategoryChildren(child.id, categories).length > 0
    )

    if (hasNestedSections) {
      for (const mid of children) {
        const leaves = getSortedCategoryChildren(mid.id, categories)
        if (leaves.length > 0) {
          groups.push({ section: mid, items: leaves })
        } else {
          groups.push({ section: mid, items: [mid] })
        }
      }
    } else {
      groups.push({ section: node, items: children })
    }
  }

  return groups
}
