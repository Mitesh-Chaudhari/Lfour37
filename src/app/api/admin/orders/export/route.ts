import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  buildOrdersSpreadsheetXml,
  ordersToExportRows,
} from '@/lib/orders-export'
import logger from '@/lib/logger'
import {
  endOfBusinessDayIso,
  startOfBusinessDayIso,
} from '@/lib/timezone'

export const dynamic = 'force-dynamic'

const ORDERS_SELECT = `
  id,
  order_number,
  status,
  payment_method,
  payment_status,
  subtotal,
  discount_amount,
  tax_amount,
  shipping_amount,
  total,
  coupon_code,
  tracking_number,
  notes,
  shipped_at,
  delivered_at,
  cancelled_at,
  created_at,
  shipping_address,
  user:users(
    full_name,
    email,
    phone
  ),
  items:order_items(
    id,
    status,
    return_status,
    return_type,
    refund_method,
    refund_status,
    refunded_amount,
    exchange_size,
    exchange_color,
    return_custom_reason,
    return_reason_id,
    seal_tag_image_url,
    product_front_image_url,
    product_back_image_url,
    bank_account,
    product_name,
    quantity,
    unit_price,
    total_price,
    variant_size,
    variant_color,
    variant:product_variants(sku),
    product:products(
      sku,
      cost_price,
      compare_price,
      name,
      categories:product_categories(
        category:categories(id, name, slug, parent_id)
      )
    )
  ),
  delhivery_shipment:delhivery_shipments(
    awb,
    status,
    expected_delivery_date
  ),
  delhivery_reverse_pickups:delhivery_reverse_pickups(
    order_item_id,
    awb,
    exchange_forward_awb,
    status
  )
`

function parseDayBoundary(value: string, endOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const iso = endOfDay
    ? endOfBusinessDayIso(value)
    : startOfBusinessDayIso(value)
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin: createAdminClient() }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth && auth.error) return auth.error

    const admin = auth.admin!
    const { searchParams } = request.nextUrl
    const from = searchParams.get('from')?.trim() || ''
    const to = searchParams.get('to')?.trim() || ''

    if (!from || !to) {
      return NextResponse.json(
        { error: 'from and to dates are required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const fromIso = parseDayBoundary(from, false)
    const toIso = parseDayBoundary(to, true)

    if (!fromIso || !toIso) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      )
    }

    if (new Date(fromIso) > new Date(toIso)) {
      return NextResponse.json(
        { error: 'from date must be on or before to date' },
        { status: 400 }
      )
    }

    const [{ data: returnReasons }, ordersResult] = await Promise.all([
      admin.from('return_reasons').select('id, label'),
      admin
        .from('orders')
        .select(ORDERS_SELECT)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(5000),
    ])

    if (ordersResult.error) {
      logger.error('Orders export query failed', { error: ordersResult.error })
      return NextResponse.json(
        { error: ordersResult.error.message },
        { status: 500 }
      )
    }

    const reasonById = new Map(
      (returnReasons || []).map((reason) => [reason.id, reason.label])
    )

    const orders = (ordersResult.data || []).map((order) => ({
      ...order,
      user: Array.isArray(order.user) ? order.user[0] || null : order.user,
      items: (order.items || []).map(
        (item: {
          return_reason_id?: string | null
          variant?: { sku?: string | null } | { sku?: string | null }[] | null
          product?:
            | { sku?: string | null; cost_price?: number | null }
            | { sku?: string | null; cost_price?: number | null }[]
            | null
        }) => ({
          ...item,
          variant: Array.isArray(item.variant)
            ? item.variant[0] || null
            : item.variant,
          product: Array.isArray(item.product)
            ? item.product[0] || null
            : item.product,
          return_reason: item.return_reason_id
            ? {
                id: item.return_reason_id,
                label: reasonById.get(item.return_reason_id),
              }
            : null,
        })
      ),
    }))

    const rows = ordersToExportRows(orders as Parameters<typeof ordersToExportRows>[0])
    const xml = buildOrdersSpreadsheetXml(rows)
    const filename = `orders-${from}-to-${to}.xls`

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('Orders export failed', { error })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
