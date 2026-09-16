import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { applyStockMovement, requireAdminUser } from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
  LFOUR37_ONLINE_LOCATION_ID,
  LFOUR37_STORE_JAMNAGAR_LOCATION_ID,
} from '@/lib/organization'

async function resolveAdminBrandId(): Promise<string> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value || value === ADMIN_BRAND_ALL) return LFOUR37_BRAND_ID
  return value
}

function startOfTodayIstIso() {
  const now = new Date()
  const ist = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  )
  ist.setHours(0, 0, 0, 0)
  // Convert IST midnight back to UTC approx via offset formatting
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}T00:00:00+05:30`
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const brandId = await resolveAdminBrandId()
  const locationId =
    request.nextUrl.searchParams.get('location_id') ||
    LFOUR37_STORE_JAMNAGAR_LOCATION_ID
  const db = createAdminClient()

  const { data, error } = await db
    .from('pos_sales')
    .select(
      `
      id, sale_number, total, payment_method, status, created_at,
      amount_cash, amount_upi, amount_card, discount_amount, subtotal,
      items:pos_sale_items(
        id, product_name, variant_size, variant_color, quantity, unit_price, line_total, barcode
      )
    `
    )
    .eq('brand_id', brandId)
    .eq('location_id', locationId)
    .gte('created_at', startOfTodayIstIso())
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sales = data || []
  const completed = sales.filter((s) => s.status === 'completed')
  const summary = {
    count: completed.length,
    total: completed.reduce((sum, s) => sum + Number(s.total || 0), 0),
    cash: completed.reduce((sum, s) => sum + Number(s.amount_cash || 0), 0),
    upi: completed.reduce((sum, s) => sum + Number(s.amount_upi || 0), 0),
    card: completed.reduce((sum, s) => sum + Number(s.amount_card || 0), 0),
  }

  return NextResponse.json({ sales, summary })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (body?.action !== 'void') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const saleId = body?.sale_id as string | undefined
  if (!saleId) {
    return NextResponse.json({ error: 'sale_id required' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: sale, error } = await db
    .from('pos_sales')
    .select(
      `
      id, status, sale_number, location_id,
      items:pos_sale_items(id, variant_id, quantity, product_id)
    `
    )
    .eq('id', saleId)
    .maybeSingle()

  if (error || !sale) {
    return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
  }
  if (sale.status === 'voided') {
    return NextResponse.json({ error: 'Sale already voided' }, { status: 400 })
  }

  const items = sale.items || []
  try {
    // Reverse exact ledger rows (store-only and/or shared online)
    const { data: movements } = await db
      .from('stock_movements')
      .select('variant_id, location_id, quantity, product_id')
      .eq('reference_type', 'pos_sale')
      .eq('reference_id', sale.id)

    if (movements && movements.length > 0) {
      for (const mov of movements) {
        const qty = Number(mov.quantity)
        if (!qty) continue
        await applyStockMovement({
          variantId: mov.variant_id,
          delta: -qty, // original qty is negative for sales; negate restores
          movementType: 'adjustment',
          locationId: mov.location_id,
          referenceType: 'pos_sale_void',
          referenceId: sale.id,
          createdBy: admin.id,
          notes: `Void ${sale.sale_number}`,
        })
      }
    } else {
      // Fallback for older sales with no ledger split
      for (const item of items) {
        await applyStockMovement({
          variantId: item.variant_id,
          delta: item.quantity,
          movementType: 'adjustment',
          locationId: LFOUR37_ONLINE_LOCATION_ID,
          referenceType: 'pos_sale_void',
          referenceId: sale.id,
          createdBy: admin.id,
          notes: `Void ${sale.sale_number}`,
        })
      }
    }

    for (const item of items) {
      const { data: productRow } = await db
        .from('products')
        .select('total_sold')
        .eq('id', item.product_id)
        .single()

      await db
        .from('products')
        .update({
          total_sold: Math.max(
            0,
            Number(productRow?.total_sold || 0) - Number(item.quantity)
          ),
        })
        .eq('id', item.product_id)
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to restore stock on void',
      },
      { status: 500 }
    )
  }

  const { error: voidError } = await db
    .from('pos_sales')
    .update({ status: 'voided' })
    .eq('id', saleId)

  if (voidError) {
    return NextResponse.json({ error: voidError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
