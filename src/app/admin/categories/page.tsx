import { createClient } from '@/lib/supabase/server'
import { CategoriesClient } from '@/components/admin/categories-client'

export default async function AdminCategoriesPage() {
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <p className="text-sm text-gray-500 mt-1">Manage product categories and hierarchy</p>
      </div>
      <CategoriesClient categories={categories || []} />
    </div>
  )
}
