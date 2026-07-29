'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit, Eye, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { AdminProductDeleteButton } from '@/components/admin/AdminProductDeleteButton'
import {
  extractCategoryIdsFromProduct,
  getCategoryDescendantIds,
  getCategoryPathLabel,
  getProductCategoryPathLabel,
} from '@/lib/categories'
import { formatPrice } from '@/lib/utils'
import type { Product, ProductStatus } from '@/types'

type AdminCategory = {
  id: string
  name: string
  slug: string
  parent_id: string | null
}

type AdminProduct = Product & {
  product_categories?: Array<{
    category?: {
      id: string
      name: string
      slug: string
      parent_id: string | null
    } | null
  }> | null
}

type SortOption =
  | 'list_sort_order'
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'sold_desc'
  | 'sold_asc'

type FlagFilter = 'all' | 'featured' | 'new' | 'trending' | 'sale'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'list_sort_order', label: 'Sort Order' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'sold_desc', label: 'Most Sold' },
  { value: 'sold_asc', label: 'Least Sold' },
]

const STATUS_OPTIONS: { value: 'all' | ProductStatus; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'draft', label: 'Draft' },
]

const FLAG_OPTIONS: { value: FlagFilter; label: string }[] = [
  { value: 'all', label: 'All Products' },
  { value: 'featured', label: 'Featured' },
  { value: 'new', label: 'New Arrival' },
  { value: 'trending', label: 'Trending' },
  { value: 'sale', label: 'On Sale' },
]

const selectClassName =
  'h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500'

function compareProducts(a: AdminProduct, b: AdminProduct, sortBy: SortOption): number {
  switch (sortBy) {
    case 'list_sort_order': {
      const aOrder = a.list_sort_order ?? Number.POSITIVE_INFINITY
      const bOrder = b.list_sort_order ?? Number.POSITIVE_INFINITY
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
    case 'newest':
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    case 'oldest':
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    case 'name_asc':
      return a.name.localeCompare(b.name)
    case 'name_desc':
      return b.name.localeCompare(a.name)
    case 'price_asc':
      return a.price - b.price
    case 'price_desc':
      return b.price - a.price
    case 'sold_desc':
      return (b.total_sold || 0) - (a.total_sold || 0)
    case 'sold_asc':
      return (a.total_sold || 0) - (b.total_sold || 0)
    default:
      return 0
  }
}

interface AdminProductsClientProps {
  products: AdminProduct[]
  categories: AdminCategory[]
}

export function AdminProductsClient({
  products,
  categories,
}: AdminProductsClientProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProductStatus>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('list_sort_order')

  const categoryOptions = useMemo(
    () =>
      [...categories]
        .map((category) => ({
          id: category.id,
          label: getCategoryPathLabel(category.id, categories),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories]
  )

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const categoryIds =
      categoryFilter === 'all'
        ? null
        : new Set(getCategoryDescendantIds(categoryFilter, categories))

    const next = products.filter((product) => {
      if (statusFilter !== 'all' && product.status !== statusFilter) {
        return false
      }

      if (flagFilter === 'featured' && !product.is_featured) return false
      if (flagFilter === 'new' && !product.is_new_arrival) return false
      if (flagFilter === 'trending' && !product.is_trending) return false
      if (
        flagFilter === 'sale' &&
        !(product.compare_price && product.compare_price > product.price)
      ) {
        return false
      }

      if (categoryIds) {
        const productCategoryIds = extractCategoryIdsFromProduct(
          product.product_categories
        )
        if (!productCategoryIds.some((id) => categoryIds.has(id))) {
          return false
        }
      }

      if (query) {
        const haystack = [
          product.name,
          product.sku || '',
          product.slug || '',
          product.barcode || '',
        ]
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(query)) return false
      }

      return true
    })

    return [...next].sort((a, b) => compareProducts(a, b, sortBy))
  }, [
    products,
    categories,
    search,
    statusFilter,
    categoryFilter,
    flagFilter,
    sortBy,
  ])

  const hasActiveFilters =
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    flagFilter !== 'all' ||
    sortBy !== 'list_sort_order'

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setFlagFilter('all')
    setSortBy('list_sort_order')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="md:col-span-2 xl:col-span-2">
            <Input
              placeholder="Search by name, SKU, slug, or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>

          <select
            className={selectClassName}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | ProductStatus)
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={flagFilter}
            onChange={(e) => setFlagFilter(e.target.value as FlagFilter)}
          >
            {FLAG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500 whitespace-nowrap">
              Sort by
            </label>
            <select
              className={selectClassName}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <p className="text-sm text-gray-500">
              Showing{' '}
              <span className="font-medium text-gray-900">
                {filteredProducts.length}
              </span>{' '}
              of {products.length}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-700"
              >
                <X className="h-4 w-4" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Product
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Sort Order
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Price
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Flags
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Sold
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    No products match your filters
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
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
                          <p className="font-medium text-gray-900 line-clamp-1">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {product.sku || 'No SKU'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 text-xs">
                        {getProductCategoryPathLabel(
                          product.product_categories,
                          categories
                        ) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600">
                        {product.list_sort_order ?? '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {formatPrice(product.price)}
                        </p>
                        {product.compare_price && (
                          <p className="text-xs text-gray-400 line-through">
                            {formatPrice(product.compare_price)}
                          </p>
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
                      <div className="flex flex-wrap gap-1">
                        {product.is_featured && (
                          <Badge variant="default">Featured</Badge>
                        )}
                        {product.is_new_arrival && (
                          <Badge variant="new">New</Badge>
                        )}
                        {product.is_trending && (
                          <Badge variant="trending">Trending</Badge>
                        )}
                        {product.compare_price &&
                          product.compare_price > product.price && (
                            <Badge variant="sale">Sale</Badge>
                          )}
                        {!product.is_featured &&
                          !product.is_new_arrival &&
                          !product.is_trending &&
                          !(
                            product.compare_price &&
                            product.compare_price > product.price
                          ) && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                      </div>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
