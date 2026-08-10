'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Edit, Eye, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { AdminProductDeleteButton } from '@/components/admin/AdminProductDeleteButton'
import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  type AdminCategory,
  type AdminProduct,
  type AdminProductFlag,
  type AdminProductSort,
  type AdminProductsQuery,
} from '@/lib/admin-products-query'
import { getCategoryPathLabel, getProductCategoryPathLabel } from '@/lib/categories'
import { formatPrice } from '@/lib/utils'
import type { ProductStatus } from '@/types'

const SORT_OPTIONS: { value: AdminProductSort; label: string }[] = [
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

const FLAG_OPTIONS: { value: AdminProductFlag; label: string }[] = [
  { value: 'all', label: 'All Products' },
  { value: 'featured', label: 'Featured' },
  { value: 'new', label: 'New Arrival' },
  { value: 'trending', label: 'Trending' },
  { value: 'sale', label: 'On Sale' },
]

const selectClassName =
  'h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500'

function getPageNumbers(
  currentPage: number,
  totalPages: number
): Array<number | 'ellipsis'> {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2
  )

  const withEllipsis: Array<number | 'ellipsis'> = []
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) {
      withEllipsis.push('ellipsis')
    }
    withEllipsis.push(pages[i])
  }
  return withEllipsis
}

function buildProductsHref(
  query: AdminProductsQuery,
  updates: Partial<AdminProductsQuery>
): string {
  const next: AdminProductsQuery = { ...query, ...updates }
  const params = new URLSearchParams()

  if (next.q) params.set('q', next.q)
  if (next.status !== 'all') params.set('status', next.status)
  if (next.category !== 'all') params.set('category', next.category)
  if (next.flag !== 'all') params.set('flag', next.flag)
  if (next.sort !== 'list_sort_order') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))

  const qs = params.toString()
  return qs ? `/admin/products?${qs}` : '/admin/products'
}

interface AdminProductsClientProps {
  products: AdminProduct[]
  categories: AdminCategory[]
  totalCount: number
  totalProducts: number
  page: number
  totalPages: number
  query: AdminProductsQuery
}

export function AdminProductsClient({
  products,
  categories,
  totalCount,
  totalProducts,
  page,
  totalPages,
  query,
}: AdminProductsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(query.q)

  useEffect(() => {
    setSearchInput(query.q)
  }, [query.q])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextQ = searchInput.trim()
      if (nextQ === query.q) return
      startTransition(() => {
        router.push(
          buildProductsHref(query, {
            q: nextQ,
            page: 1,
          })
        )
      })
    }, 350)

    return () => window.clearTimeout(handle)
  }, [searchInput, query, router])

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

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * ADMIN_PRODUCTS_PAGE_SIZE + 1
  const rangeEnd = Math.min(page * ADMIN_PRODUCTS_PAGE_SIZE, totalCount)

  const hasActiveFilters =
    query.q !== '' ||
    query.status !== 'all' ||
    query.category !== 'all' ||
    query.flag !== 'all' ||
    query.sort !== 'list_sort_order'

  const navigate = (updates: Partial<AdminProductsQuery>) => {
    startTransition(() => {
      router.push(buildProductsHref(query, updates))
    })
  }

  const clearFilters = () => {
    setSearchInput('')
    startTransition(() => {
      router.push(pathname)
    })
  }

  return (
    <div className={`space-y-4 ${isPending ? 'opacity-70 transition-opacity' : ''}`}>
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="sm:col-span-2 xl:col-span-2">
            <Input
              placeholder="Search by name, SKU, slug, or barcode..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>

          <select
            className={selectClassName}
            value={query.status}
            onChange={(e) =>
              navigate({
                status: e.target.value as AdminProductsQuery['status'],
                page: 1,
              })
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
            value={query.category}
            onChange={(e) =>
              navigate({
                category: e.target.value,
                page: 1,
              })
            }
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
            value={query.flag}
            onChange={(e) =>
              navigate({
                flag: e.target.value as AdminProductFlag,
                page: 1,
              })
            }
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
              value={query.sort}
              onChange={(e) =>
                navigate({
                  sort: e.target.value as AdminProductSort,
                  page: 1,
                })
              }
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
                {rangeStart}-{rangeEnd}
              </span>{' '}
              of{' '}
              <span className="font-medium text-gray-900">{totalCount}</span>
              {totalCount !== totalProducts && (
                <> (filtered from {totalProducts})</>
              )}
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
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    No products match your filters
                  </td>
                </tr>
              ) : (
                products.map((product) => (
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

        {totalCount > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              Page{' '}
              <span className="font-medium text-gray-900">{page}</span> of{' '}
              <span className="font-medium text-gray-900">{totalPages}</span>
              <span className="text-gray-400">
                {' '}
                · {ADMIN_PRODUCTS_PAGE_SIZE} per page
              </span>
            </p>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate({ page: Math.max(1, page - 1) })}
                disabled={page <= 1 || isPending}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>

              {getPageNumbers(page, totalPages).map((entry, index) =>
                entry === 'ellipsis' ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-2 text-sm text-gray-400"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => navigate({ page: entry })}
                    disabled={isPending}
                    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm transition-colors ${
                      page === entry
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {entry}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() =>
                  navigate({ page: Math.min(totalPages, page + 1) })
                }
                disabled={page >= totalPages || isPending}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
