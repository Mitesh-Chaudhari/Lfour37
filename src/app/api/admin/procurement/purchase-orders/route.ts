import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
  YADEVI_COMPANY_ID,
} from '@/lib/organization'

async function resolveAdminBrandId(): Promise<string> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value || value === ADMIN_BRAND_ALL) return LFOUR37_BRAND_ID
  return value
}

const createPoSchema = z.object({
  supplier_name: z.string().min(1).max(200),
  notes: z.string().max(1000).nullable().optional(),
  expected_date: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity_ordered: z.number().int().min(1),
        unit_cost: z.number().min(0).default(0),
      })
    )
    .min(1),
})

export async function GET() {
  const admin = await requireAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const brandId = await resolveAdminBrandId()
  const db = createAdminClient()
  const { data, error } = await db
    .from('purchase_orders')
    .select(
      `
      id, po_number, supplier_name, status, order_date, expected_date, notes, created_at,
      items:purchase_order_items(
        id, variant_id, product_id, quantity_ordered, quantity_received, unit_cost,
        variant:product_variants(size, color, barcode),
        product:products(name, sku)
      ),
      invoices:purchase_invoices(id, invoice_number, status, total)
    `
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ purchase_orders: data || [] })
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminUser()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const action = body?.action as string | undefined
  const db = createAdminClient()
  const brandId = await resolveAdminBrandId()

  if (action === 'confirm') {
    const poId = body?.po_id as string | undefined
    if (!poId) return NextResponse.json({ error: 'po_id required' }, { status: 400 })

    const { data: po, error } = await db
      .from('purchase_orders')
      .select(
        `
        *,
        items:purchase_order_items(*)
      `
      )
      .eq('id', poId)
      .maybeSingle()

    if (error || !po) {
      return NextResponse.json({ error: 'PO not found' }, { status: 404 })
    }
    if (po.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft POs can be confirmed' }, { status: 400 })
    }

    const { error: updError } = await db
      .from('purchase_orders')
      .update({ status: 'ordered' })
      .eq('id', poId)

    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 })
    }

    // Auto-create purchase invoice from PO
    const { data: invNo } = await db.rpc('next_purchase_invoice_number')
    const items = po.items || []
    const subtotal = items.reduce(
      (sum: number, item: { quantity_ordered: number; unit_cost: number }) =>
        sum + Number(item.quantity_ordered) * Number(item.unit_cost || 0),
      0
    )

    const { data: invoice, error: invError } = await db
      .from('purchase_invoices')
      .insert({
        company_id: po.company_id,
        brand_id: po.brand_id,
        po_id: po.id,
        supplier_name: po.supplier_name,
        invoice_number: (invNo as string) || `PI-${Date.now()}`,
        status: 'draft',
        subtotal,
        tax_amount: 0,
        total: subtotal,
        notes: `Auto-created from ${po.po_number}`,
        created_by: adminUser.id,
      })
      .select()
      .single()

    if (invError || !invoice) {
      return NextResponse.json(
        { error: invError?.message || 'PO confirmed but invoice failed' },
        { status: 500 }
      )
    }

    await db.from('purchase_invoice_items').insert(
      items.map(
        (item: {
          product_id: string
          variant_id: string
          quantity_ordered: number
          unit_cost: number
        }) => ({
          invoice_id: invoice.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity_ordered,
          unit_cost: item.unit_cost,
          line_total: Number(item.quantity_ordered) * Number(item.unit_cost || 0),
        })
      )
    )

    return NextResponse.json({
      success: true,
      purchase_order_id: poId,
      purchase_invoice: invoice,
    })
  }

  // Create draft PO
  const parsed = createPoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const variantIds = parsed.data.items.map((i) => i.variant_id)
  const { data: variants } = await db
    .from('product_variants')
    .select('id, product_id, product:products!inner(id, brand_id)')
    .in('id', variantIds)

  if (!variants || variants.length !== variantIds.length) {
    return NextResponse.json({ error: 'Invalid variants' }, { status: 400 })
  }

  for (const v of variants) {
    const product = Array.isArray(v.product) ? v.product[0] : v.product
    if (!product || product.brand_id !== brandId) {
      return NextResponse.json({ error: 'Variant brand mismatch' }, { status: 400 })
    }
  }

  const { data: poNumber } = await db.rpc('next_po_number')
  const { data: po, error: poError } = await db
    .from('purchase_orders')
    .insert({
      company_id: YADEVI_COMPANY_ID,
      brand_id: brandId,
      supplier_name: parsed.data.supplier_name,
      po_number: (poNumber as string) || `PO-${Date.now()}`,
      status: 'draft',
      expected_date: parsed.data.expected_date || null,
      notes: parsed.data.notes || null,
      created_by: adminUser.id,
    })
    .select()
    .single()

  if (poError || !po) {
    return NextResponse.json({ error: poError?.message || 'Failed to create PO' }, { status: 500 })
  }

  const { error: itemsError } = await db.from('purchase_order_items').insert(
    parsed.data.items.map((item) => {
      const variant = variants.find((v) => v.id === item.variant_id)!
      return {
        po_id: po.id,
        product_id: variant.product_id,
        variant_id: item.variant_id,
        quantity_ordered: item.quantity_ordered,
        unit_cost: item.unit_cost,
      }
    })
  )

  if (itemsError) {
    await db.from('purchase_orders').delete().eq('id', po.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, purchase_order: po })
}
