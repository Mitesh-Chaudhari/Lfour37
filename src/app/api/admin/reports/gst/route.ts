import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
} from '@/lib/organization'
import { DEFAULT_HSN_CODE } from '@/lib/invoice'
import {
  isCountableOnlineOrder,
  isInterstateSupply,
  parseReportRange,
  round2,
  splitInclusiveGst,
} from '@/lib/reports'

async function resolveAdminBrandId(): Promise<string | null> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value) return LFOUR37_BRAND_ID
  if (value === ADMIN_BRAND_ALL) return null
  return value
}

type HsnBucket = {
  hsn: string
  quantity: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  invoiceCount: number
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const range = parseReportRange(
    searchParams.get('from'),
    searchParams.get('to')
  )
  const brandId = await resolveAdminBrandId()
  const db = createAdminClient()

  let ordersQuery = db
    .from('orders')
    .select(
      `
      id, order_number, created_at, total, subtotal, discount_amount,
      shipping_amount, status, payment_method, payment_status, shipping_address, brand_id,
      items:order_items(id, product_name, quantity, total_price, hsn_code, status)
    `
    )
    .gte('created_at', range.fromIso)
    .lt('created_at', range.toIsoExclusive)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (brandId) ordersQuery = ordersQuery.eq('brand_id', brandId)

  let posQuery = db
    .from('pos_sales')
    .select(
      `
      id, sale_number, created_at, total, subtotal, discount_amount,
      status, payment_method, brand_id,
      items:pos_sale_items(
        id, product_name, quantity, line_total, variant_id,
        variant:product_variants(product:products(hsn_code))
      )
    `
    )
    .eq('status', 'completed')
    .gte('created_at', range.fromIso)
    .lt('created_at', range.toIsoExclusive)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (brandId) posQuery = posQuery.eq('brand_id', brandId)

  const [{ data: orders, error: ordersError }, { data: posSales, error: posError }] =
    await Promise.all([ordersQuery, posQuery])

  if (ordersError || posError) {
    return NextResponse.json(
      { error: ordersError?.message || posError?.message || 'Query failed' },
      { status: 500 }
    )
  }

  const invoices: Array<{
    channel: 'online' | 'store'
    number: string
    date: string
    placeOfSupply: string
    taxType: 'CGST+SGST' | 'IGST'
    taxable: number
    cgst: number
    sgst: number
    igst: number
    total: number
  }> = []

  const hsnMap = new Map<string, HsnBucket>()

  const addHsn = (
    hsn: string,
    quantity: number,
    split: ReturnType<typeof splitInclusiveGst>
  ) => {
    const key = hsn || DEFAULT_HSN_CODE
    const existing = hsnMap.get(key) || {
      hsn: key,
      quantity: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      invoiceCount: 0,
    }
    existing.quantity += quantity
    existing.taxable = round2(existing.taxable + split.taxable)
    existing.cgst = round2(existing.cgst + split.cgst)
    existing.sgst = round2(existing.sgst + split.sgst)
    existing.igst = round2(existing.igst + split.igst)
    hsnMap.set(key, existing)
  }

  for (const order of orders || []) {
    if (!isCountableOnlineOrder(order)) continue

    const address = (order.shipping_address || {}) as Record<string, string>
    const interstate = isInterstateSupply(address.state)
    const items = (order.items || []).filter(
      (item) =>
        item.status !== 'cancelled' && item.status !== 'cancel_requested'
    )
    if (items.length === 0) continue

    let taxable = 0
    let cgst = 0
    let sgst = 0
    let igst = 0

    const subtotal = Number(order.subtotal) || 0
    const discount = Number(order.discount_amount) || 0

    for (const item of items) {
      const inclusive = Number(item.total_price) || 0
      const lineDiscount =
        subtotal > 0 ? discount * (inclusive / subtotal) : 0
      const afterDiscount = Math.max(0, inclusive - lineDiscount)
      const split = splitInclusiveGst(afterDiscount, { interstate })
      taxable = round2(taxable + split.taxable)
      cgst = round2(cgst + split.cgst)
      sgst = round2(sgst + split.sgst)
      igst = round2(igst + split.igst)
      addHsn(item.hsn_code || DEFAULT_HSN_CODE, Number(item.quantity) || 0, split)
    }

    // Shipping treated as taxable inclusive too when present
    const shipping = Number(order.shipping_amount) || 0
    if (shipping > 0) {
      const split = splitInclusiveGst(shipping, { interstate })
      taxable = round2(taxable + split.taxable)
      cgst = round2(cgst + split.cgst)
      sgst = round2(sgst + split.sgst)
      igst = round2(igst + split.igst)
      addHsn('996511', 1, split)
    }

    invoices.push({
      channel: 'online',
      number: order.order_number,
      date: order.created_at,
      placeOfSupply: address.state || 'Gujarat',
      taxType: interstate ? 'IGST' : 'CGST+SGST',
      taxable,
      cgst,
      sgst,
      igst,
      total: Number(order.total) || 0,
    })
  }

  for (const sale of posSales || []) {
    const items = sale.items || []
    let taxable = 0
    let cgst = 0
    let sgst = 0
    let igst = 0

    const subtotal = Number(sale.subtotal) || 0
    const discount = Number(sale.discount_amount) || 0

    for (const item of items) {
      const inclusive = Number(item.line_total) || 0
      const lineDiscount =
        subtotal > 0 ? discount * (inclusive / subtotal) : 0
      const afterDiscount = Math.max(0, inclusive - lineDiscount)
      const split = splitInclusiveGst(afterDiscount, { interstate: false })
      taxable = round2(taxable + split.taxable)
      cgst = round2(cgst + split.cgst)
      sgst = round2(sgst + split.sgst)

      const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant
      const product = variant
        ? Array.isArray(variant.product)
          ? variant.product[0]
          : variant.product
        : null
      addHsn(
        (product?.hsn_code as string) || DEFAULT_HSN_CODE,
        Number(item.quantity) || 0,
        split
      )
    }

    invoices.push({
      channel: 'store',
      number: sale.sale_number,
      date: sale.created_at,
      placeOfSupply: 'Gujarat',
      taxType: 'CGST+SGST',
      taxable,
      cgst,
      sgst,
      igst,
      total: Number(sale.total) || 0,
    })
  }

  invoices.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const totals = invoices.reduce(
    (acc, row) => {
      acc.invoiceCount += 1
      acc.taxable = round2(acc.taxable + row.taxable)
      acc.cgst = round2(acc.cgst + row.cgst)
      acc.sgst = round2(acc.sgst + row.sgst)
      acc.igst = round2(acc.igst + row.igst)
      acc.total = round2(acc.total + row.total)
      if (row.channel === 'online') acc.onlineTotal = round2(acc.onlineTotal + row.total)
      else acc.storeTotal = round2(acc.storeTotal + row.total)
      return acc
    },
    {
      invoiceCount: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
      onlineTotal: 0,
      storeTotal: 0,
      gstRatePercent: round2(splitInclusiveGst(100).rate * 100),
    }
  )

  const hsnSummary = [...hsnMap.values()].sort((a, b) =>
    a.hsn.localeCompare(b.hsn)
  )

  return NextResponse.json({
    range: { from: range.fromDate, to: range.toDate },
    totals,
    hsnSummary,
    invoices: invoices.slice(0, 500),
    note:
      'Tax is derived from inclusive prices at configured GST rate (default 5%). Store POS treated as intra-state (Gujarat). Use CSV export for your CA / GSTR working papers — this is not a filing portal.',
  })
}
