import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProductForm } from '@/components/admin/product-form'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminProductEditPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*, variants:product_variants(*), categories:product_categories(category_id)')
      .eq('id', id)
      .single(),
    supabase
      .from('categories')
      .select('id, name, parent_id')
      .eq('is_active', true)
      .order('name'),
  ])

  if (!product) notFound()

  const productWithCategories = {
    ...product,
    category_ids: (product.categories || []).map((c: { category_id: string }) => c.category_id),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
        <p className="text-sm text-gray-500 mt-1">{product.name}</p>
      </div>
      <ProductForm initialData={productWithCategories} categories={(categories || []) as any} />
    </div>
  )
}
