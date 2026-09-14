import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/inventory'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
} from '@/lib/organization'
import {
  isCountableOnlineOrder,
  istDateKey,
  parseReportRange,
  round2,
} from '@/lib/reports'

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
      'id, order_number, created_at, total, status, payment_method, payment_status, brand_id'
    )
    .gte('created_at', range.fromIso)
    .lt('created_at', range.toIsoExclusive)
    .limit(5000)

  if (brandId) ordersQuery = ordersQuery.eq('brand_id', brandId)

  let posQuery = db
    .from('pos_sales')
    .select('id, sale_number, created_at, total, status, payment_method, brand_id')
    .eq('status', 'completed')
    .gte('created_at', range.fromIso)
    .lt('created_at', range.toIsoExclusive)
    .limit(5000)

  if (brandId) posQuery = posQuery.eq('brand_id', brandId)

  const [{ data: orders, error: ordersError }, { data: posSales, error: posError }] =
    await Promise.all([ordersQuery, posQuery])

  if (ordersError || posError) {
    return NextResponse.json(
      { error: ordersError?.message || posError?.message || 'Query failed' },
      { status: 500 }
    )
  }

  const onlineOrders = (orders || []).filter(isCountableOnlineOrder)
  const storeSales = posSales || []

  const byDay = new Map<
    string,
    { date: string; online: number; store: number; onlineOrders: number; storeOrders: number }
  >()

  const ensureDay = (date: string) => {
    if (!byDay.has(date)) {
      byDay.set(date, {
        date,
        online: 0,
        store: 0,
        onlineOrders: 0,
        storeOrders: 0,
      })
    }
    return byDay.get(date)!
  }

  // Fill all days in range
  {
    const cursor = new Date(`${range.fromDate}T12:00:00+05:30`)
    const end = new Date(`${range.toDate}T12:00:00+05:30`)
    while (cursor <= end) {
      const key = cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      ensureDay(key)
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  for (const order of onlineOrders) {
    const day = ensureDay(istDateKey(order.created_at))
    day.online = round2(day.online + Number(order.total || 0))
    day.onlineOrders += 1
  }

  for (const sale of storeSales) {
    const day = ensureDay(istDateKey(sale.created_at))
    day.store = round2(day.store + Number(sale.total || 0))
    day.storeOrders += 1
  }

  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))

  const onlineTotal = round2(
    onlineOrders.reduce((sum, o) => sum + Number(o.total || 0), 0)
  )
  const storeTotal = round2(
    storeSales.reduce((sum, s) => sum + Number(s.total || 0), 0)
  )
  const combined = round2(onlineTotal + storeTotal)

  const paymentMix = {
    online: {} as Record<string, number>,
    store: {} as Record<string, number>,
  }

  for (const order of onlineOrders) {
    const key = order.payment_method || 'other'
    paymentMix.online[key] = round2(
      (paymentMix.online[key] || 0) + Number(order.total || 0)
    )
  }
  for (const sale of storeSales) {
    const key = sale.payment_method || 'other'
    paymentMix.store[key] = round2(
      (paymentMix.store[key] || 0) + Number(sale.total || 0)
    )
  }

  return NextResponse.json({
    range: { from: range.fromDate, to: range.toDate },
    summary: {
      onlineTotal,
      storeTotal,
      combined,
      onlineOrders: onlineOrders.length,
      storeOrders: storeSales.length,
      onlineSharePct: combined > 0 ? round2((onlineTotal / combined) * 100) : 0,
      storeSharePct: combined > 0 ? round2((storeTotal / combined) * 100) : 0,
      onlineAov:
        onlineOrders.length > 0
          ? round2(onlineTotal / onlineOrders.length)
          : 0,
      storeAov:
        storeSales.length > 0 ? round2(storeTotal / storeSales.length) : 0,
    },
    daily,
    paymentMix,
  })
}
