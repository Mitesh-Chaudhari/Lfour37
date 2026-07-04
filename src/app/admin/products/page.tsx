import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Edit, Eye } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ProductBulkUpload } from '@/components/admin/product-bulk-upload'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { AdminProductDeleteButton } from '@/components/admin/AdminProductDeleteButton'
import { getProductCategoryPathLabel } from '@/lib/categories'

async function getProducts() {
  const supabase = await createClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        product_categories(category:categories(id, name, slug, parent_id))
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('is_active', true),
  ])

  return {
    products: products || [],
    categories: categories || [],
  }
}

export default async function AdminProductsPage() {
  const { products, categories } = await getProducts()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 mt-1">{products.length} products total</p>
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

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Sold</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {product.images?.[0]?.url ? (
                          <OptimizedImage
                            src={product.images[0].url}
                            alt={product.name}
                            fill
                            variant="adminThumb"
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full bg-gray-200" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 line-clamp-1">{product.name}</p>
                        <p className="text-xs text-gray-400">{product.sku || 'No SKU'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-600 text-xs">
                      {getProductCategoryPathLabel(product.product_categories, categories) || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{formatPrice(product.price)}</p>
                      {product.compare_price && (
                        <p className="text-xs text-gray-400 line-through">{formatPrice(product.compare_price)}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        product.status === 'active'
                          ? 'success'
                          : product.status === 'inactive'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {product.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-600">{product.total_sold}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/products/${product.slug}`}
                        target="_blank"
                        className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                      <AdminProductDeleteButton productId={product.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
