import type { Category } from '@/types'

export interface CategorySectionGroup {
  section: Category
  items: Category[]
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
