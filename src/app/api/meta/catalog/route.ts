import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { CategoryRef } from '@/lib/categories'
import {
  buildCatalogCsv,
  buildCatalogRow,
  isCatalogRequestAuthorized,
  type CatalogProduct,
  type CatalogRow,
} from '@/lib/meta-catalog'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!isCatalogRequestAuthorized(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const [productsRes, categoriesRes] = await Promise.all([
      supabase
        .from('products')
        .select(
          `
          id, name, slug, description, short_description, price, compare_price,
          sku, barcode, images,
          variants:product_variants(stock, is_active, size, color),
          categories:product_categories(category:categories(id, name, slug, parent_id))
        `
        )
        .eq('status', 'active'),
      supabase
        .from('categories')
        .select('id, name, slug, parent_id'),
    ])

    if (productsRes.error) {
      throw productsRes.error
    }

    const allCategories = (categoriesRes.data || []) as CategoryRef[]
    const products = (productsRes.data || []) as unknown as CatalogProduct[]

    const rows: CatalogRow[] = []
    for (const product of products) {
      const row = buildCatalogRow(product, allCategories)
      if (row) rows.push(row)
    }

    const csv = buildCatalogCsv(rows)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'inline; filename="meta-catalog.csv"',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    logger.error('Meta catalog feed generation failed', { error })
    return NextResponse.json(
      { error: 'Failed to generate catalog feed' },
      { status: 500 }
    )
  }
}
