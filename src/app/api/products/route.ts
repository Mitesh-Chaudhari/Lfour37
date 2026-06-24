import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  applyProductSearchFilter,
  getProductIdsFromCategorySearch,
  sanitizeSearchTerm,
} from '@/lib/search'

export async function GET(
  req: NextRequest
) {
  const supabase =
    await createClient()

  const searchParams =
    req.nextUrl.searchParams

  //////////////////////////////////////////////////////
  // PAGINATION
  //////////////////////////////////////////////////////

  const page =
    Number(
      searchParams.get('page')
    ) || 1

  const perPage = 16

  const from =
    (page - 1) * perPage

  const to =
    from + perPage - 1

  //////////////////////////////////////////////////////
  // FILTERS
  //////////////////////////////////////////////////////

  const category =
    searchParams.get(
      'category'
    )

  const minPrice =
    searchParams.get(
      'minPrice'
    )

  const maxPrice =
    searchParams.get(
      'maxPrice'
    )

  const search =
    searchParams.get(
      'search'
    )

  const sortBy =
    searchParams.get(
      'sortBy'
    )

  const filter =
    searchParams.get(
      'filter'
    )

  const minRating =
    searchParams.get(
      'minRating'
    )

  const inStock =
    searchParams.get(
      'inStock'
    )

  const sizes =
    searchParams.getAll(
      'sizes'
    )

  const colors =
    searchParams.getAll(
      'colors'
    )

  //////////////////////////////////////////////////////
  // BASE QUERY
  //////////////////////////////////////////////////////

  const searchTerm = search
    ? sanitizeSearchTerm(search)
    : ''

  const categoryJoin = searchTerm
    ? 'product_categories'
    : 'product_categories!inner'

  let query = supabase
    .from('products')
    .select(
      `
      *,
      variants:product_variants(*),
      ${categoryJoin}(
        category:categories(*)
      )
    `,
      {
        count: 'exact',
      }
    )
    .eq(
      'status',
      'active'
    )

  //////////////////////////////////////////////////////
  // CATEGORY FILTER
  //////////////////////////////////////////////////////

  if (category) {

    const {
      data:
        allCategories,
    } =
      await supabase
        .from(
          'categories'
        )
        .select(
          'id, slug, parent_id'
        )

    const selected =
      allCategories?.find(
        (c) =>
          c.slug ===
          category
      )

    if (selected) {

      const childIds =
        allCategories
          ?.filter(
            (c) =>
              c.parent_id ===
              selected.id
          )
          .map(
            (c) => c.id
          ) || []

      query =
        query.in(
          'product_categories.category_id',
          [
            selected.id,
            ...childIds,
          ]
        )
    }
  }

  //////////////////////////////////////////////////////
  // SPECIAL FILTERS
  //////////////////////////////////////////////////////

  if (
    filter ===
    'featured'
  ) {
    query =
      query.eq(
        'is_featured',
        true
      )
  }

  if (
    filter === 'new'
  ) {
    query =
      query.eq(
        'is_new_arrival',
        true
      )
  }

  if (
    filter ===
    'trending'
  ) {
    query =
      query.eq(
        'is_trending',
        true
      )
  }

  if (
    filter ===
    'sale'
  ) {
    query =
      query.not(
        'compare_price',
        'is',
        null
      )
  }

  //////////////////////////////////////////////////////
  // PRICE
  //////////////////////////////////////////////////////

  if (minPrice) {
    query =
      query.gte(
        'price',
        Number(
          minPrice
        )
      )
  }

  if (maxPrice) {
    query =
      query.lte(
        'price',
        Number(
          maxPrice
        )
      )
  }

  //////////////////////////////////////////////////////
  // RATING
  //////////////////////////////////////////////////////

  if (minRating) {
    query =
      query.gte(
        'average_rating',
        Number(
          minRating
        )
      )
  }

  //////////////////////////////////////////////////////
  // SEARCH
  //////////////////////////////////////////////////////

  if (searchTerm) {
    const categoryProductIds =
      await getProductIdsFromCategorySearch(
        supabase,
        searchTerm
      )

    query = applyProductSearchFilter(
      query,
      searchTerm,
      categoryProductIds
    )
  }

  //////////////////////////////////////////////////////
  // SORTING
  //////////////////////////////////////////////////////

  switch (sortBy) {

    case 'price_asc':
      query =
        query.order(
          'price',
          {
            ascending: true,
          }
        )
      break

    case 'price_desc':
      query =
        query.order(
          'price',
          {
            ascending: false,
          }
        )
      break

    case 'newest':
      query =
        query.order(
          'created_at',
          {
            ascending: false,
          }
        )
      break

    case 'popular':
      query =
        query.order(
          'total_sold',
          {
            ascending: false,
          }
        )
      break

    case 'rating':
      query =
        query.order(
          'average_rating',
          {
            ascending: false,
          }
        )
      break

    default:
      query =
        query.order(
          'created_at',
          {
            ascending: false,
          }
        )
  }

  //////////////////////////////////////////////////////
  // PAGINATION
  //////////////////////////////////////////////////////

  query =
    query.range(
      from,
      to
    )

  const {
    data,
    count,
    error,
  } = await query

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }

  //////////////////////////////////////////////////////
  // CLIENT-SIDE FILTERS
  // (variants are nested)
  //////////////////////////////////////////////////////

  let products =
    data || []

  if (
    sizes.length > 0
  ) {
    products =
      products.filter(
        (product: any) =>
          product.variants?.some(
            (variant: any) =>
              sizes.includes(
                variant.size
              )
          )
      )
  }

    if (colors.length > 0) {
    products =
        products.filter(
        (product: any) =>
            product.variants?.some(
            (variant: any) =>
                colors
                .map((c) =>
                    c.toLowerCase()
                )
                .includes(
                    (
                    variant.color_group ||
                    ''
                    ).toLowerCase()
                )
            )
        )
    }

  if (
    inStock ===
    'true'
  ) {
    products =
      products.filter(
        (product: any) =>
          product.variants?.some(
            (variant: any) =>
              variant.stock > 0
          )
      )
  }

  //////////////////////////////////////////////////////
  // RESPONSE
  //////////////////////////////////////////////////////

  return NextResponse.json({
    products,

    total:
      count || 0,

    page,

    hasMore:
      to + 1 <
      (count || 0),
  })
}