import { createClient } from '@/lib/supabase/server'
import { CategoriesClient } from '@/components/admin/categories-client'
import { getCategoryDescendantIds, type CategoryRef } from '@/lib/categories'

async function getCategoryProductCounts(categories: CategoryRef[]) {
  const supabase = await createClient()

  const { data: productCategories } = await supabase
    .from('product_categories')
    .select('product_id, category_id')

  const directByCategory = new Map<string, Set<string>>()

  for (const row of productCategories || []) {
    if (!row.category_id || !row.product_id) continue
    const existing = directByCategory.get(row.category_id) || new Set<string>()
    existing.add(row.product_id)
    directByCategory.set(row.category_id, existing)
  }

  const counts: Record<string, number> = {}

  for (const category of categories) {
    const categoryIds = getCategoryDescendantIds(category.id, categories)
    const productIds = new Set<string>()

    for (const categoryId of categoryIds) {
      const direct = directByCategory.get(categoryId)
      if (direct) {
        direct.forEach((productId) => productIds.add(productId))
      }
    }

    counts[category.id] = productIds.size
  }

  return counts
}

export default async function AdminCategoriesPage() {
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  const productCounts = await getCategoryProductCounts(categories || [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <p className="text-sm text-gray-500 mt-1">Manage product categories and hierarchy</p>
      </div>
      <CategoriesClient
        categories={categories || []}
        productCounts={productCounts}
      />
    </div>
  )
}
