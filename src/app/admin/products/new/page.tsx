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

async function getSizes() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('product_sizes')
    .select('name')
    .order('display_order')
    .order('name')
  return (data || []).map((size) => size.name)
}

import { mappingsArrayToRecord } from '@/lib/hsn'

async function getHsnMappings() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('category_hsn_mappings')
    .select('category_id, hsn_code')
  return mappingsArrayToRecord(data || [])
}

export default async function NewProductPage() {
  const [categories, sizes, uniqueColorGroups, hsnMappings] = await Promise.all([
    getCategories(),
    getSizes(),
    getUniqueColorGroups(),
    getHsnMappings(),
  ])
  return (
    <div className="">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Add New Product</h1>
      <ProductForm
        categories={categories}
        hsnMappings={hsnMappings}
        colorGroups={uniqueColorGroups}
        sizes={sizes}
      />
    </div>
  )
}
