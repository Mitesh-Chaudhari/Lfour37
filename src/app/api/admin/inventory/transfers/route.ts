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
  LFOUR37_ONLINE_LOCATION_ID,
  LFOUR37_STORE_JAMNAGAR_LOCATION_ID,
  YADEVI_COMPANY_ID,
} from '@/lib/organization'

async function resolveAdminBrandId(): Promise<string> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value || value === ADMIN_BRAND_ALL) return LFOUR37_BRAND_ID
  return value
}

const transferSchema = z.object({
  from_location_id: z.string().uuid().optional(),
  to_location_id: z.string().uuid().optional(),
  /** Convenience: transfer to online, store, or both (equal qty each destination) */
  destination: z.enum(['online', 'store', 'both']).optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100000),
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
    .from('stock_transfers')
    .select(
      `
      id, transfer_number, status, notes, posted_at, created_at,
      from_location_id, to_location_id,
      items:stock_transfer_items(id, variant_id, quantity)
    `
    )
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const locationIds = Array.from(
    new Set(
      (data || []).flatMap((t) =>
        [t.from_location_id, t.to_location_id].filter(Boolean)
      )
    )
  ) as string[]

  const { data: locations } =
    locationIds.length > 0
      ? await db.from('locations').select('id, name, code').in('id', locationIds)
      : { data: [] as Array<{ id: string; name: string; code: string }> }

  const locMap = new Map((locations || []).map((l) => [l.id, l]))
  const transfers = (data || []).map((t) => ({
    ...t,
    from_location: locMap.get(t.from_location_id) || null,
    to_location: locMap.get(t.to_location_id) || null,
  }))

  return NextResponse.json({ transfers })
}

async function postOneTransfer(params: {
  db: ReturnType<typeof createAdminClient>
  brandId: string
  adminUserId: string
  fromLocationId: string
  toLocationId: string
  notes: string | null
  items: Array<{ variant_id: string; quantity: number; product_id: string }>
}) {
  const { data: transferNumber } = await params.db.rpc('next_transfer_number')

  const { data: transfer, error: transferError } = await params.db
    .from('stock_transfers')
    .insert({
      company_id: YADEVI_COMPANY_ID,
      brand_id: params.brandId,
      from_location_id: params.fromLocationId,
      to_location_id: params.toLocationId,
      transfer_number: (transferNumber as string) || `TR-${Date.now()}`,
      status: 'posted',
      notes: params.notes,
      created_by: params.adminUserId,
      posted_by: params.adminUserId,
      posted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (transferError || !transfer) {
    throw new Error(transferError?.message || 'Failed to create transfer')
  }

  const { error: itemsError } = await params.db.from('stock_transfer_items').insert(
    params.items.map((item) => ({
      transfer_id: transfer.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
    }))
  )

  if (itemsError) {
    await params.db.from('stock_transfers').delete().eq('id', transfer.id)
    throw new Error(itemsError.message)
  }

  for (const item of params.items) {
    await applyStockMovement({
      variantId: item.variant_id,
      delta: -item.quantity,
      movementType: 'transfer_out',
      locationId: params.fromLocationId,
      referenceType: 'stock_transfer',
      referenceId: transfer.id,
      createdBy: params.adminUserId,
      notes: transfer.transfer_number,
    })
    await applyStockMovement({
      variantId: item.variant_id,
      delta: item.quantity,
      movementType: 'transfer_in',
      locationId: params.toLocationId,
      referenceType: 'stock_transfer',
      referenceId: transfer.id,
      createdBy: params.adminUserId,
      notes: transfer.transfer_number,
    })
  }

  return transfer
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminUser()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = transferSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const data = parsed.data
  const db = createAdminClient()
  const brandId = await resolveAdminBrandId()
  const fromLocationId = data.from_location_id || LFOUR37_WAREHOUSE_LOCATION_ID

  let destinations: string[] = []
  if (data.destination === 'both') {
    destinations = [LFOUR37_ONLINE_LOCATION_ID, LFOUR37_STORE_JAMNAGAR_LOCATION_ID]
  } else if (data.destination === 'online') {
    destinations = [LFOUR37_ONLINE_LOCATION_ID]
  } else if (data.destination === 'store') {
    destinations = [LFOUR37_STORE_JAMNAGAR_LOCATION_ID]
  } else if (data.to_location_id) {
    destinations = [data.to_location_id]
  } else {
    return NextResponse.json(
      { error: 'Provide to_location_id or destination (online|store|both)' },
      { status: 400 }
    )
  }

  if (destinations.includes(fromLocationId)) {
    return NextResponse.json(
      { error: 'Source and destination must differ' },
      { status: 400 }
    )
  }

  const variantIds = data.items.map((i) => i.variant_id)
  const { data: variants } = await db
    .from('product_variants')
    .select('id, product_id, product:products!inner(id, brand_id, name)')
    .in('id', variantIds)

  if (!variants || variants.length !== variantIds.length) {
    return NextResponse.json({ error: 'Invalid variants' }, { status: 400 })
  }

  const enriched: Array<{
    variant_id: string
    quantity: number
    product_id: string
  }> = []

  for (const item of data.items) {
    const variant = variants.find((v) => v.id === item.variant_id)
    if (!variant) {
      return NextResponse.json({ error: 'Invalid variants' }, { status: 400 })
    }
    const product = Array.isArray(variant.product)
      ? variant.product[0]
      : variant.product
    if (!product || product.brand_id !== brandId) {
      return NextResponse.json({ error: 'Variant brand mismatch' }, { status: 400 })
    }
    enriched.push({
      variant_id: item.variant_id,
      quantity: item.quantity,
      product_id: variant.product_id as string,
    })
  }

  // For "both", same qty goes to each destination — need enough at source
  const multiplier = destinations.length
  const { data: levels } = await db
    .from('stock_levels')
    .select('variant_id, quantity')
    .eq('location_id', fromLocationId)
    .in('variant_id', variantIds)

  const levelMap = new Map(
    (levels || []).map((row) => [row.variant_id as string, Number(row.quantity)])
  )

  for (const item of enriched) {
    const have = levelMap.get(item.variant_id) || 0
    const need = item.quantity * multiplier
    if (have < need) {
      return NextResponse.json(
        {
          error: `Insufficient warehouse stock for a variant (need ${need}, have ${have})`,
        },
        { status: 409 }
      )
    }
  }

  try {
    const transfers = []
    for (const toLocationId of destinations) {
      const transfer = await postOneTransfer({
        db,
        brandId,
        adminUserId: adminUser.id,
        fromLocationId,
        toLocationId,
        notes: data.notes || null,
        items: enriched,
      })
      transfers.push(transfer)
    }
    return NextResponse.json({ success: true, transfers })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transfer failed' },
      { status: 500 }
    )
  }
}
