import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/admin/product-form'

async function getCategories() {
  const supabase = await createClient()
  const { data } = await supabase.from('categories').select('id, name, slug').eq('is_active', true).order('sort_order')
  return data || []
}

export default async function NewProductPage() {
  const categories = await getCategories()
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Add New Product</h1>
      <ProductForm categories={categories} />
    </div>
  )
}
