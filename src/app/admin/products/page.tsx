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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Products</h1>
          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            {activeCategoryLabel
              ? `Showing products in ${activeCategoryLabel}`
              : `${products.length} products total`}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-3">
          <ProductBulkUpload />
          <Link
            href="/admin/products/new"
            className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700"
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
