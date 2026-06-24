import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  applyProductSearchFilter,
  getProductIdsFromCategorySearch,
  sanitizeSearchTerm,
  type SearchCategoryResult,
  type SearchProductResult,
} from '@/lib/search'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const q = sanitizeSearchTerm(req.nextUrl.searchParams.get('q') || '')

  if (!q) {
    const [trendingProductsRes, categoriesRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, slug, price, compare_price, images')
        .eq('status', 'active')
        .eq('is_trending', true)
        .order('total_sold', { ascending: false })
        .limit(6),
      supabase
        .from('categories')
        .select('id, name, slug, image_url')
        .eq('is_active', true)
        .is('parent_id', null)
        .order('sort_order', { ascending: true })
        .limit(8),
    ])

    return NextResponse.json({
      products: (trendingProductsRes.data || []) as SearchProductResult[],
      categories: (categoriesRes.data || []) as SearchCategoryResult[],
      trending: (categoriesRes.data || []).slice(0, 6).map((c) => c.name),
    })
  }

  const categoryProductIds = await getProductIdsFromCategorySearch(supabase, q)

  let productQuery = supabase
    .from('products')
    .select('id, name, slug, price, compare_price, images')
    .eq('status', 'active')

  productQuery = applyProductSearchFilter(productQuery, q, categoryProductIds)
  productQuery = productQuery
    .order('total_sold', { ascending: false })
    .limit(8)

  const [productsRes, categoriesRes] = await Promise.all([
    productQuery,
    supabase
      .from('categories')
      .select('id, name, slug, image_url')
      .eq('is_active', true)
      .ilike('name', `%${q}%`)
      .order('sort_order', { ascending: true })
      .limit(6),
  ])

  if (productsRes.error) {
    return NextResponse.json({ error: productsRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    products: (productsRes.data || []) as SearchProductResult[],
    categories: (categoriesRes.data || []) as SearchCategoryResult[],
    query: q,
  })
}
