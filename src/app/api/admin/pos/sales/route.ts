import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import {
  applyStockMovement,
  getOpenPosSession,
  requireAdminUser,
} from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
  LFOUR37_STORE_JAMNAGAR_LOCATION_ID,
  YADEVI_COMPANY_ID,
} from '@/lib/organization'

const saleSchema = z.object({
  location_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  discount_amount: z.number().min(0).optional().default(0),
  payment_method: z.enum(['cash', 'upi', 'card', 'mixed']),
  amount_cash: z.number().min(0).optional().default(0),
  amount_upi: z.number().min(0).optional().default(0),
  amount_card: z.number().min(0).optional().default(0),
  notes: z.string().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
      })
    )
    .min(1),
})

async function resolveAdminBrandId(): Promise<string> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value || value === ADMIN_BRAND_ALL) return LFOUR37_BRAND_ID
  return value
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = saleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const data = parsed.data
  const db = createAdminClient()
  const brandId = await resolveAdminBrandId()
  const locationId = data.location_id || LFOUR37_STORE_JAMNAGAR_LOCATION_ID

  let session = data.session_id
    ? (
        await db
          .from('pos_sessions')
          .select('*')
          .eq('id', data.session_id)
          .eq('status', 'open')
          .maybeSingle()
      ).data
    : await getOpenPosSession(locationId)

  if (!session) {
    const { data: opened, error: openError } = await db
      .from('pos_sessions')
      .insert({
        company_id: YADEVI_COMPANY_ID,
        brand_id: brandId,
        location_id: locationId,
        opened_by: adminUser.id,
        opening_float: 0,
        status: 'open',
      })
      .select()
      .single()

    if (openError || !opened) {
      return NextResponse.json(
        { error: openError?.message || 'Failed to open POS session' },
        { status: 500 }
      )
    }
    session = opened
  }

  const variantIds = data.items.map((i) => i.variant_id)
  const { data: variants, error: variantError } = await db
    .from('product_variants')
    .select(
      `
      id, size, color, stock, barcode, price_modifier, is_active, product_id,
      product:products!inner(id, name, price, brand_id, status)
    `
    )
    .in('id', variantIds)
    .eq('is_active', true)

  if (variantError || !variants || variants.length !== variantIds.length) {
    return NextResponse.json(
      { error: 'One or more items are unavailable' },
      { status: 400 }
    )
  }

  const { data: levels } = await db
    .from('stock_levels')
    .select('variant_id, quantity')
    .eq('location_id', session.location_id)
    .in('variant_id', variantIds)

  // Prefer location stock; fall back to variant.stock until migration 048 is applied
  const levelMap = new Map(
    (levels || []).map((row) => [row.variant_id as string, Number(row.quantity)])
  )

  const lines = []
  for (const item of data.items) {
    const variant = variants.find((v) => v.id === item.variant_id)
    if (!variant) {
      return NextResponse.json({ error: 'Variant missing' }, { status: 400 })
    }
    const product = Array.isArray(variant.product)
      ? variant.product[0]
      : variant.product
    if (!product || product.brand_id !== brandId || product.status !== 'active') {
      return NextResponse.json(
        { error: `Item not available for this brand: ${product?.name || item.variant_id}` },
        { status: 400 }
      )
    }
    const available = levelMap.has(variant.id)
      ? levelMap.get(variant.id)!
      : Number(variant.stock)
    if (available < item.quantity) {
      return NextResponse.json(
        {
          error: `Insufficient stock for ${product.name} (${variant.size}/${variant.color})`,
        },
        { status: 409 }
      )
    }
    const unitPrice = Number(product.price) + Number(variant.price_modifier || 0)
    lines.push({
      product_id: product.id as string,
      variant_id: variant.id as string,
      product_name: product.name as string,
      variant_size: variant.size as string,
      variant_color: variant.color as string,
      barcode: (variant.barcode as string | null) || null,
      quantity: item.quantity,
      unit_price: unitPrice,
      line_total: Number((unitPrice * item.quantity).toFixed(2)),
    })
  }

  const subtotal = Number(
    lines.reduce((sum, line) => sum + line.line_total, 0).toFixed(2)
  )
  const discount = Math.min(data.discount_amount || 0, subtotal)
  const total = Number((subtotal - discount).toFixed(2))

  let amountCash = data.amount_cash || 0
  let amountUpi = data.amount_upi || 0
  let amountCard = data.amount_card || 0

  if (data.payment_method === 'cash') {
    amountCash = total
    amountUpi = 0
    amountCard = 0
  } else if (data.payment_method === 'upi') {
    amountUpi = total
    amountCash = 0
    amountCard = 0
  } else if (data.payment_method === 'card') {
    amountCard = total
    amountCash = 0
    amountUpi = 0
  }

  const paid = Number((amountCash + amountUpi + amountCard).toFixed(2))
  if (Math.abs(paid - total) > 0.05) {
    return NextResponse.json(
      { error: `Payment amounts (₹${paid}) must equal total (₹${total})` },
      { status: 400 }
    )
  }

  const { data: saleNumberData } = await db.rpc('next_pos_sale_number')
  const saleNumber =
    (saleNumberData as string) ||
    `POS-${Date.now().toString().slice(-10)}`

  const { data: sale, error: saleError } = await db
    .from('pos_sales')
    .insert({
      session_id: session.id,
      company_id: session.company_id || YADEVI_COMPANY_ID,
      brand_id: session.brand_id || brandId,
      location_id: session.location_id,
      sale_number: saleNumber,
      subtotal,
      discount_amount: discount,
      tax_amount: 0,
      total,
      payment_method: data.payment_method,
      amount_cash: amountCash,
      amount_upi: amountUpi,
      amount_card: amountCard,
      status: 'completed',
      notes: data.notes || null,
      created_by: adminUser.id,
    })
    .select()
    .single()

  if (saleError || !sale) {
    return NextResponse.json(
      { error: saleError?.message || 'Failed to create sale' },
      { status: 500 }
    )
  }

  const { error: itemsError } = await db.from('pos_sale_items').insert(
    lines.map((line) => ({
      sale_id: sale.id,
      ...line,
    }))
  )

  if (itemsError) {
    await db.from('pos_sales').delete().eq('id', sale.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  try {
    for (const line of lines) {
      await applyStockMovement({
        variantId: line.variant_id,
        delta: -line.quantity,
        movementType: 'pos_sale',
        locationId: session.location_id,
        referenceType: 'pos_sale',
        referenceId: sale.id,
        createdBy: adminUser.id,
        notes: sale.sale_number,
      })

      const { data: productRow } = await db
        .from('products')
        .select('total_sold')
        .eq('id', line.product_id)
        .single()

      await db
        .from('products')
        .update({
          total_sold: Number(productRow?.total_sold || 0) + line.quantity,
        })
        .eq('id', line.product_id)
    }
  } catch (error) {
    await db.from('pos_sales').update({ status: 'voided' }).eq('id', sale.id)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Stock deduction failed — sale voided',
      },
      { status: 409 }
    )
  }

  return NextResponse.json({
    success: true,
    sale: {
      ...sale,
      items: lines,
    },
  })
}
