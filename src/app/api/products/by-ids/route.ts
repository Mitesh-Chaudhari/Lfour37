import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/server'
import { LISTING_PRODUCT_SELECT } from '@/lib/catalog-queries'
import {
  enrichProductsWithBestSeller,
  getBestSellerProductIds,
} from '@/lib/products'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids') || ''
  const ids = [
    ...new Set(
      idsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, 12)

  if (!ids.length) {
    return NextResponse.json({ products: [] })
  }

  const supabase = createPublicClient()
  const [{ data }, bestSellerIds] = await Promise.all([
    supabase
      .from('products')
      .select(LISTING_PRODUCT_SELECT)
      .eq('status', 'active')
      .in('id', ids),
    getBestSellerProductIds(supabase),
  ])

  const byId = new Map((data || []).map((product) => [product.id, product]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))

  return NextResponse.json({
    products: enrichProductsWithBestSeller(ordered, bestSellerIds),
  })
}
