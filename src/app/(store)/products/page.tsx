import { createClient } from '@/lib/supabase/server'
import { ProductCard } from '@/components/product/product-card'
import { ProductFiltersPanel } from '@/components/product/product-filters'
import { ProductSort } from '@/components/product/product-sort'
import { ProductPagination } from '@/components/product/product-pagination'
import { ProductCardSkeleton } from '@/components/ui/skeleton'
import InfiniteProducts from '@/components/product/infinite-products'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Product } from '@/types'

interface PageProps {
  searchParams: Promise<{
    category?: string
    minPrice?: string
    maxPrice?: string
    sizes?: string | string[]
    colors?: string | string[]
    minRating?: string
    inStock?: string
    search?: string
    sortBy?: string
    page?: string
    filter?: string
  }>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams
  const category = params.category
  return {
    title: category
      ? `${category.charAt(0).toUpperCase() + category.slice(1)} Clothing`
      : 'All Products',
    description: 'Browse our full collection of premium clothing.',
  }
}

function buildCategoryTree(categories: any[]) {
  const map = new Map()
  const roots: any[] = []

  categories.forEach((cat) => {
    map.set(cat.id, { ...cat, children: [] })
  })

  categories.forEach((cat) => {
    if (cat.parent_id) {
      map.get(cat.parent_id)?.children.push(map.get(cat.id))
    } else {
      roots.push(map.get(cat.id))
    }
  })

  return roots
}

async function getProducts(searchParams: Awaited<PageProps['searchParams']>) {
  const supabase = await createClient()

  const page = Number(searchParams.page) || 1
  const perPage = 16
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  let query = supabase
    .from('products')
    .select(
      `
      *,
      variants:product_variants(*),
      product_categories!inner(
        category:categories(*)
      )
    `,
      { count: 'exact' }
    )
    .eq('status', 'active')

  ////////////////////////////////////////////////////////////////
  // ✅ FIXED CATEGORY FILTER (parent + children)
  ////////////////////////////////////////////////////////////////

  if (searchParams.category) {
    const { data: allCategories } = await supabase
      .from('categories')
      .select('id, slug, parent_id')

    if (allCategories) {
      const selected = allCategories.find(
        (c) => c.slug === searchParams.category
      )

      if (selected) {
        const childIds = allCategories
          .filter((c) => c.parent_id === selected.id)
          .map((c) => c.id)

        const ids = [selected.id, ...childIds]

        query = query.in('product_categories.category_id', ids)
      }
    }
  }

  ////////////////////////////////////////////////////////////////

  if (searchParams.filter === 'featured') query = query.eq('is_featured', true)
  if (searchParams.filter === 'new') query = query.eq('is_new_arrival', true)
  if (searchParams.filter === 'trending') query = query.eq('is_trending', true)
  if (searchParams.filter === 'sale') query = query.not('compare_price', 'is', null)

  if (searchParams.minPrice) query = query.gte('price', Number(searchParams.minPrice))
  if (searchParams.maxPrice) query = query.lte('price', Number(searchParams.maxPrice))

  if (searchParams.minRating) query = query.gte('average_rating', Number(searchParams.minRating))

  if (searchParams.search) {
    query = query.ilike('name', `%${searchParams.search}%`)
  }

  switch (searchParams.sortBy) {
    case 'price_asc':
      query = query.order('price', { ascending: true })
      break
    case 'price_desc':
      query = query.order('price', { ascending: false })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    case 'popular':
      query = query.order('total_sold', { ascending: false })
      break
    case 'rating':
      query = query.order('average_rating', { ascending: false })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  query = query.range(from, to)

  const { data, count } = await query

  let products = (data as unknown as Product[]) || []

  const sizes =
    typeof searchParams.sizes === 'string'
      ? [searchParams.sizes]
      : searchParams.sizes || []

  const colors =
    typeof searchParams.colors === 'string'
      ? [searchParams.colors]
      : searchParams.colors || []

  const inStockOnly = searchParams.inStock === 'true'

  if (sizes.length > 0) {
    products = products.filter((p) =>
      p.variants?.some((v) => sizes.includes(v.size))
    )
  }

  if (colors.length > 0) {
    products = products.filter((p) =>
      p.variants?.some((v) =>
        colors
          .map((c) => c.toLowerCase())
          .includes(
            (v.color_group || '')
              .toLowerCase()
          )
      )
    )
  }

  if (inStockOnly) {
    products = products.filter((p) =>
      p.variants?.some((v) => v.stock > 0)
    )
  }

  return { products, total: count || 0, page, perPage }
}

//////////////////////////////////////////////////////////////////
// ✅ FILTER OPTIONS (NOW WITH TREE)
//////////////////////////////////////////////////////////////////

async function getFilterOptions() {
  const supabase = await createClient()

  const [categoriesRes, variantsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('is_active', true)
      .order('sort_order'),

    supabase
      .from('product_variants')
      .select(`
        size,
        color_group,
        products!inner(
          status
        )
      `)
      .eq(
        'is_active',
        true
      )
      .eq(
        'products.status',
        'active'
      )
  ])

  const variants = variantsRes.data || []

  const sizes = [...new Set(variants.map((v) => v.size))].sort()
  const colors =
  [
    ...new Set(
      variants
        .map(
          (v: any) =>
            v.color_group
        )
        .filter(Boolean)
    ),
  ].sort()

  const categoryTree = buildCategoryTree(categoriesRes.data || [])

  return {
    categories: categoryTree,
    sizes,
    colors,
  }
}

//////////////////////////////////////////////////////////////////
// ✅ MAIN PAGE
//////////////////////////////////////////////////////////////////

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams

  const [{ products, total, page, perPage }, filterOptions] =
    await Promise.all([getProducts(params), getFilterOptions()])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Filters */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <ProductFiltersPanel
            categories={filterOptions.categories}
            sizes={filterOptions.sizes}
            colors={filterOptions.colors}
            searchParams={params}
          />
        </aside>

        {/* Products */}
        <div className="">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-600">
              {params.search && (
                <>
                  Results for <strong>"{params.search}"</strong> —{' '}
                </>
              )}
              <strong>{total}</strong> products
            </p>

            <ProductSort currentSort={params.sortBy} />
          </div>

          <Suspense
            fallback={
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            }
          >
            {products.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No products found
                </h3>
                <p className="text-gray-500">
                  Try adjusting your filters or search terms
                </p>
              </div>
            ) : (
                <InfiniteProducts
                  initialProducts={products}
                  searchParams={params}
                />
            )}
          </Suspense>

          {/* {totalPages > 1 && (
            <div className="mt-10">
              <ProductPagination currentPage={page} totalPages={totalPages} />
            </div>
          )} */}
        </div>
      </div>
    </div>
  )
}