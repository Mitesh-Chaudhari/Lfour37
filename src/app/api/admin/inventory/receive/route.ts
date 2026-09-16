import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { applyStockMovement, requireAdminUser } from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
  LFOUR37_WAREHOUSE_LOCATION_ID,
  YADEVI_COMPANY_ID,
} from '@/lib/organization'

const receiveSchema = z.object({
  location_id: z.string().uuid().optional(),
  po_id: z.string().uuid().optional().nullable(),
  purchase_invoice_id: z.string().uuid().optional().nullable(),
  supplier_name: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100000),
        unit_cost: z.number().min(0).nullable().optional(),
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

  const parsed = receiveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const data = parsed.data
  const db = createAdminClient()
  const brandId = await resolveAdminBrandId()
  // New receipts land in Warehouse; transfer to Online/Store separately
  const locationId = data.location_id || LFOUR37_WAREHOUSE_LOCATION_ID

  let supplierName = data.supplier_name || null
  let purchaseInvoiceId = data.purchase_invoice_id || null

  if (data.po_id) {
    const { data: po } = await db
      .from('purchase_orders')
      .select('id, brand_id, supplier_name, status')
      .eq('id', data.po_id)
      .maybeSingle()

    if (!po || po.brand_id !== brandId) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }
    if (po.status === 'cancelled' || po.status === 'draft') {
      return NextResponse.json(
        { error: 'Confirm the PO before receiving against it' },
        { status: 400 }
      )
    }
    supplierName = supplierName || po.supplier_name

    if (!purchaseInvoiceId) {
      const { data: inv } = await db
        .from('purchase_invoices')
        .select('id')
        .eq('po_id', data.po_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      purchaseInvoiceId = inv?.id || null
    }
  }

  const variantIds = data.items.map((i) => i.variant_id)
  const { data: variants } = await db
    .from('product_variants')
    .select('id, product_id, product:products!inner(id, brand_id, name)')
    .in('id', variantIds)

  if (!variants || variants.length !== variantIds.length) {
    return NextResponse.json({ error: 'Invalid variants' }, { status: 400 })
  }

  for (const variant of variants) {
    const product = Array.isArray(variant.product)
      ? variant.product[0]
      : variant.product
    if (!product || product.brand_id !== brandId) {
      return NextResponse.json(
        { error: 'Variant does not belong to selected brand' },
        { status: 400 }
      )
    }
  }

  const { data: receiptNumber } = await db.rpc('next_stock_receipt_number')

  const { data: receipt, error: receiptError } = await db
    .from('stock_receipts')
    .insert({
      company_id: YADEVI_COMPANY_ID,
      brand_id: brandId,
      location_id: locationId,
      po_id: data.po_id || null,
      purchase_invoice_id: purchaseInvoiceId,
      receipt_number: (receiptNumber as string) || `GRN-${Date.now()}`,
      supplier_name: supplierName,
      notes: data.notes || null,
      status: 'posted',
      created_by: adminUser.id,
      posted_by: adminUser.id,
      posted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (receiptError || !receipt) {
    return NextResponse.json(
      { error: receiptError?.message || 'Failed to create receipt' },
      { status: 500 }
    )
  }

  const itemsPayload = data.items.map((item) => {
    const variant = variants.find((v) => v.id === item.variant_id)!
    return {
      receipt_id: receipt.id,
      product_id: variant.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost ?? null,
    }
  })

  const { error: itemsError } = await db
    .from('stock_receipt_items')
    .insert(itemsPayload)

  if (itemsError) {
    await db.from('stock_receipts').delete().eq('id', receipt.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  try {
    for (const item of data.items) {
      await applyStockMovement({
        variantId: item.variant_id,
        delta: item.quantity,
        movementType: 'grn_receive',
        locationId,
        referenceType: 'stock_receipt',
        referenceId: receipt.id,
        createdBy: adminUser.id,
        notes: receipt.receipt_number,
      })
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Stock receive failed after receipt create',
        receipt_id: receipt.id,
      },
      { status: 500 }
    )
  }

  // Update PO received quantities + status
  if (data.po_id) {
    const { data: poItems } = await db
      .from('purchase_order_items')
      .select('id, variant_id, quantity_ordered, quantity_received')
      .eq('po_id', data.po_id)

    if (poItems) {
      for (const item of data.items) {
        const poItem = poItems.find((p) => p.variant_id === item.variant_id)
        if (!poItem) continue
        const nextReceived = Number(poItem.quantity_received) + item.quantity
        await db
          .from('purchase_order_items')
          .update({ quantity_received: nextReceived })
          .eq('id', poItem.id)
      }

      const { data: refreshed } = await db
        .from('purchase_order_items')
        .select('quantity_ordered, quantity_received')
        .eq('po_id', data.po_id)

      const allReceived =
        refreshed?.every(
          (row) => Number(row.quantity_received) >= Number(row.quantity_ordered)
        ) ?? false
      const anyReceived =
        refreshed?.some((row) => Number(row.quantity_received) > 0) ?? false

      await db
        .from('purchase_orders')
        .update({
          status: allReceived ? 'received' : anyReceived ? 'partial' : 'ordered',
        })
        .eq('id', data.po_id)
    }

    if (purchaseInvoiceId) {
      await db
        .from('purchase_invoices')
        .update({
          status: 'posted',
          posted_by: adminUser.id,
          posted_at: new Date().toISOString(),
        })
        .eq('id', purchaseInvoiceId)
        .eq('status', 'draft')
    }
  }

  return NextResponse.json({ success: true, receipt })
}

export async function GET() {
  const adminUser = await requireAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const brandId = await resolveAdminBrandId()
  const db = createAdminClient()
  const { data, error } = await db
    .from('stock_receipts')
    .select(
      'id, receipt_number, supplier_name, status, posted_at, created_at, location_id, po_id, notes'
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ receipts: data || [] })
}
