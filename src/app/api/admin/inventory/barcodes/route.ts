import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
} from '@/lib/organization'

async function resolveAdminBrandId(): Promise<string> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value || value === ADMIN_BRAND_ALL) return LFOUR37_BRAND_ID
  return value
}

export async function GET() {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const brandId = await resolveAdminBrandId()
  const db = createAdminClient()
  const { data, error } = await db
    .from('product_variants')
    .select(
      `
      id, size, color, stock, barcode, sku, is_active,
      product:products!inner(id, name, sku, brand_id, status)
    `
    )
    .eq('product.brand_id', brandId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const variants = (data || []).map((row) => {
    const product = Array.isArray(row.product) ? row.product[0] : row.product
    return {
      id: row.id as string,
      size: row.size as string,
      color: row.color as string,
      stock: Number(row.stock),
      barcode: (row.barcode as string | null) || null,
      sku: (row.sku as string | null) || null,
      product_id: product?.id as string,
      product_name: product?.name as string,
      product_sku: (product?.sku as string | null) || null,
      product_status: product?.status as string,
    }
  })

  return NextResponse.json({ variants })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const action = body?.action as string | undefined
  const db = createAdminClient()

  if (action === 'set_barcode') {
    const variantId = body?.variant_id as string | undefined
    const barcode = String(body?.barcode || '').trim()
    if (!variantId || !barcode) {
      return NextResponse.json(
        { error: 'variant_id and barcode required' },
        { status: 400 }
      )
    }

    const { error } = await db
      .from('product_variants')
      .update({ barcode })
      .eq('id', variantId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
