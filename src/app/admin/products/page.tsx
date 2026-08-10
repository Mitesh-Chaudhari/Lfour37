import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ProductBulkUpload } from '@/components/admin/product-bulk-upload'
import { AdminProductsClient } from '@/components/admin/products-client'
import {
  getAdminProductsPage,
} from '@/lib/admin-products-query'
import { parseAdminProductsQuery } from '@/lib/admin-products'
import { getCategoryPathLabel } from '@/lib/categories'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const parsedQuery = parseAdminProductsQuery(params)
  const {
    products,
    categories,
    totalCount,
    totalProducts,
    page,
    totalPages,
    query,
  } = await getAdminProductsPage(parsedQuery)

  const activeCategoryLabel =
    query.category !== 'all'
      ? getCategoryPathLabel(query.category, categories)
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Products
          </h1>
          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            {activeCategoryLabel
              ? `Showing products in ${activeCategoryLabel}`
              : `${totalProducts} products total`}
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
        totalCount={totalCount}
        totalProducts={totalProducts}
        page={page}
        totalPages={totalPages}
        query={query}
      />
    </div>
  )
}
