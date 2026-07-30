import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ProductBulkUpload } from '@/components/admin/product-bulk-upload'
import { AdminProductsClient } from '@/components/admin/products-client'
import { getCategoryPathLabel } from '@/lib/categories'

interface PageProps {
  searchParams: Promise<{ category?: string }>
}

async function getProducts() {
  const supabase = await createClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        product_categories(category:categories(id, name, slug, parent_id))
      `)
      .order('list_sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, slug, parent_id')
      .order('sort_order', { ascending: true }),
  ])

  return {
    products: products || [],
    categories: categories || [],
  }
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const { category: categoryId } = await searchParams
  const { products, categories } = await getProducts()

  const initialCategoryId =
    categoryId && categories.some((category) => category.id === categoryId)
      ? categoryId
      : 'all'

  const activeCategoryLabel =
    initialCategoryId !== 'all'
      ? getCategoryPathLabel(initialCategoryId, categories)
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 mt-1">
            {activeCategoryLabel
              ? `Showing products in ${activeCategoryLabel}`
              : `${products.length} products total`}
          </p>
        </div>
        <div className="flex gap-3">
          <ProductBulkUpload />
          <Link
            href="/admin/products/new"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Product
          </Link>
        </div>
      </div>

      <AdminProductsClient
        products={products}
        categories={categories}
        initialCategoryId={initialCategoryId}
      />
    </div>
  )
}
