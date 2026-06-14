import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/admin/product-form'
import { getUniqueColorGroups } from '@/lib/product-colors'

async function getCategories() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id')
    .eq('is_active', true)
    .order('sort_order')
  return data || []
}

const uniqueColorGroups = await getUniqueColorGroups()

export default async function NewProductPage() {
  const categories = await getCategories()
  return (
    <div className="">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Add New Product</h1>
      <ProductForm categories={categories} colorGroups={
          uniqueColorGroups
        }/>
    </div>
  )
}
