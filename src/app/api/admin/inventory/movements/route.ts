import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
} from '@/lib/organization'

async function resolveAdminBrandId(): Promise<string | null> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value) return LFOUR37_BRAND_ID
  if (value === ADMIN_BRAND_ALL) return null
  return value
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const brandId = await resolveAdminBrandId()
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get('limit') || 100),
    300
  )
  const movementType = request.nextUrl.searchParams.get('type')

  const db = createAdminClient()
  let query = db
    .from('stock_movements')
    .select(
      `
      id, movement_type, quantity, quantity_before, quantity_after,
      reference_type, reference_id, notes, created_at, location_id, brand_id,
      product:products(id, name, sku),
      variant:product_variants(id, size, color, barcode, sku)
    `
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (brandId) query = query.eq('brand_id', brandId)
  if (movementType && movementType !== 'all') {
    query = query.eq('movement_type', movementType)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ movements: data || [] })
}
