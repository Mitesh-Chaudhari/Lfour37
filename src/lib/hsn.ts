export interface CategoryRef {
  id: string
  parent_id: string | null
}

export type HsnMappingRecord = Record<string, string>

function categoryDepth(
  categoryId: string,
  categoryById: Map<string, CategoryRef>
): number {
  let depth = 0
  let currentId: string | null = categoryId

  while (currentId) {
    const parentId: string | null = categoryById.get(currentId)!.parent_id
    if (!parentId) break
    depth++
    currentId = parentId
  }

  return depth
}

function findMappingForBranch(
  categoryId: string,
  categoryById: Map<string, CategoryRef>,
  mappings: HsnMappingRecord
): string | null {
  let currentId: string | null = categoryId

  while (currentId) {
    const hsn = mappings[currentId]
    if (hsn) return hsn
    currentId = categoryById.get(currentId)!.parent_id ?? null
  }

  return null
}

/** Resolve HSN from selected categories, preferring the deepest match. */
export function resolveHsnFromCategories(
  categoryIds: string[],
  categories: CategoryRef[],
  mappings: HsnMappingRecord
): string | null {
  if (!categoryIds.length) return null

  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const sortedIds = [...categoryIds].sort(
    (a, b) => categoryDepth(b, categoryById) - categoryDepth(a, categoryById)
  )

  for (const categoryId of sortedIds) {
    const hsn = findMappingForBranch(categoryId, categoryById, mappings)
    if (hsn) return hsn
  }

  return null
}

export function mappingsArrayToRecord(
  mappings: Array<{ category_id: string; hsn_code: string }>
): HsnMappingRecord {
  return mappings.reduce<HsnMappingRecord>((record, mapping) => {
    record[mapping.category_id] = mapping.hsn_code
    return record
  }, {})
}
