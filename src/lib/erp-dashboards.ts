import type { SupabaseClient } from '@supabase/supabase-js'
import {
  endOfBusinessDayIso,
  formatDateInBusinessTz,
  shiftBusinessDay,
  startOfBusinessDayIso,
} from '@/lib/timezone'
import { channelFromAttribution } from '@/lib/attribution'
import type { DateRange } from '@/lib/admin-dashboard'
import { resolveDatePreset } from '@/lib/admin-dashboard'

export { resolveDatePreset }
export type { DateRange }

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return round2(((current - previous) / Math.abs(previous)) * 100)
}

function monthKey(iso: string) {
  return formatDateInBusinessTz(new Date(iso)).slice(0, 7) // YYYY-MM
}

function isCountableOrder(status?: string | null) {
  return !['cancelled', 'refunded', 'returned'].includes(status || '')
}

function isPaidLike(order: {
  payment_method?: string | null
  payment_status?: string | null
  status?: string | null
}) {
  if (order.payment_status === 'completed') return true
  if (order.payment_method === 'cod' && order.status === 'delivered') return true
  return false
}

function isUnpaid(order: {
  payment_method?: string | null
  payment_status?: string | null
  status?: string | null
}) {
  if (['cancelled', 'refunded', 'returned'].includes(order.status || '')) {
    return false
  }
  if (order.payment_status === 'completed') return false
  if (order.payment_method === 'cod' && order.status === 'delivered') return false
  return (
    order.payment_status === 'pending' ||
    order.payment_method === 'cod' ||
    !order.payment_status
  )
}

export async function buildSalesErpDashboard(
  db: SupabaseClient,
  range: DateRange,
  previous: DateRange
) {
  const fromIso = startOfBusinessDayIso(range.from)
  const toIso = endOfBusinessDayIso(range.to)
  const prevFromIso = startOfBusinessDayIso(previous.from)
  const prevToIso = endOfBusinessDayIso(previous.to)

  const selectCols = `
    id, order_number, created_at, total, subtotal, status,
    payment_method, payment_status, user_id,
    shipping_address, utm_source, utm_campaign, utm_medium, gclid, fbclid,
    items:order_items(quantity, product_id, product_name, total, status)
  `

  const [{ data: orders }, { data: prevOrders }] = await Promise.all([
    db
      .from('orders')
      .select(selectCols)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .limit(8000),
    db
      .from('orders')
      .select('id, total, status, payment_status, payment_method')
      .gte('created_at', prevFromIso)
      .lte('created_at', prevToIso)
      .limit(8000),
  ])

  const current = (orders || []).filter((o) => isCountableOrder(o.status))
  const prev = (prevOrders || []).filter((o) => isCountableOrder(o.status))

  const revenue = current.reduce((s, o) => s + Number(o.total || 0), 0)
  const prevRevenue = prev.reduce((s, o) => s + Number(o.total || 0), 0)
  const orderCount = current.length
  const prevOrderCount = prev.length
  const aov = orderCount ? revenue / orderCount : 0
  const prevAov = prevOrderCount ? prevRevenue / prevOrderCount : 0

  // Monthly revenue
  const monthlyMap = new Map<string, number>()
  for (const o of current) {
    const key = monthKey(o.created_at)
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(o.total || 0))
  }
  const monthlySales = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, revenue: round2(amount) }))

  // Top products
  const productMap = new Map<
    string,
    { product: string; orders: number; revenue: number }
  >()
  for (const o of current) {
    const items = Array.isArray(o.items) ? o.items : []
    for (const item of items) {
      if (['cancelled', 'refunded'].includes(item.status || '')) continue
      const name = item.product_name || 'Unknown'
      const row = productMap.get(name) || { product: name, orders: 0, revenue: 0 }
      row.orders += Number(item.quantity || 0)
      row.revenue += Number(item.total || 0)
      productMap.set(name, row)
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((r) => ({ ...r, revenue: round2(r.revenue) }))

  // Top customers
  const customerMap = new Map<
    string,
    { customer: string; orders: number; revenue: number }
  >()
  for (const o of current) {
    const addr = o.shipping_address as { full_name?: string; name?: string } | null
    const name =
      addr?.full_name || addr?.name || (o.user_id ? `User ${o.user_id.slice(0, 8)}` : 'Guest')
    const row = customerMap.get(name) || { customer: name, orders: 0, revenue: 0 }
    row.orders += 1
    row.revenue += Number(o.total || 0)
    customerMap.set(name, row)
  }
  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((r) => ({ ...r, revenue: round2(r.revenue) }))

  // Top sources / mediums (attribution)
  const sourceMap = new Map<string, { source: string; orders: number; revenue: number }>()
  const mediumMap = new Map<string, { medium: string; orders: number; revenue: number }>()
  for (const o of current) {
    const source =
      channelFromAttribution({
        utm_source: o.utm_source,
        gclid: o.gclid,
        fbclid: o.fbclid,
      }) || o.utm_source || 'Direct'
    const medium = o.utm_medium || 'none'
    const s = sourceMap.get(source) || { source, orders: 0, revenue: 0 }
    s.orders += 1
    s.revenue += Number(o.total || 0)
    sourceMap.set(source, s)
    const m = mediumMap.get(medium) || { medium, orders: 0, revenue: 0 }
    m.orders += 1
    m.revenue += Number(o.total || 0)
    mediumMap.set(medium, m)
  }

  const topSalesOrders = [...current]
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 10)
    .map((o) => ({
      reference: o.order_number,
      customer:
        (o.shipping_address as { full_name?: string } | null)?.full_name || '—',
      total: round2(Number(o.total || 0)),
      status: o.status,
      date: o.created_at,
    }))

  return {
    view: 'sales' as const,
    range,
    previous,
    kpis: {
      quotations: 0, // Phase 3
      quotationsDelta: null as number | null,
      orders: orderCount,
      ordersDelta: pctDelta(orderCount, prevOrderCount),
      revenue: round2(revenue),
      revenueDelta: pctDelta(revenue, prevRevenue),
      averageOrder: round2(aov),
      averageOrderDelta: pctDelta(aov, prevAov),
    },
    monthlySales,
    topProducts,
    topCustomers,
    topSources: Array.from(sourceMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((r) => ({ ...r, revenue: round2(r.revenue) })),
    topMediums: Array.from(mediumMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((r) => ({ ...r, revenue: round2(r.revenue) })),
    topSalesOrders,
    placeholders: {
      quotations:
        'Quotations module comes in Phase 3. KPI will populate after quotes exist.',
    },
  }
}

export async function buildPosErpDashboard(
  db: SupabaseClient,
  range: DateRange,
  previous: DateRange
) {
  const fromIso = startOfBusinessDayIso(range.from)
  const toIso = endOfBusinessDayIso(range.to)
  const prevFromIso = startOfBusinessDayIso(previous.from)
  const prevToIso = endOfBusinessDayIso(previous.to)

  const [{ data: sales }, { data: prevSales }] = await Promise.all([
    db
      .from('pos_sales')
      .select(
        `
        id, sale_number, created_at, total, status, payment_method,
        amount_cash, amount_upi, amount_card, session_id, location_id,
        items:pos_sale_items(quantity, product_name, line_total)
      `
      )
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .limit(5000),
    db
      .from('pos_sales')
      .select('id, total, status')
      .eq('status', 'completed')
      .gte('created_at', prevFromIso)
      .lte('created_at', prevToIso)
      .limit(5000),
  ])

  const current = sales || []
  const prev = prevSales || []
  const revenue = current.reduce((s, o) => s + Number(o.total || 0), 0)
  const prevRevenue = prev.reduce((s, o) => s + Number(o.total || 0), 0)

  const sessionMap = new Map<
    string,
    { session: string; orders: number; revenue: number }
  >()
  const locationMap = new Map<
    string,
    { pointOfSale: string; orders: number; revenue: number }
  >()
  const productMap = new Map<
    string,
    { product: string; qty: number; revenue: number }
  >()

  let cash = 0
  let upi = 0
  let card = 0

  for (const sale of current) {
    cash += Number(sale.amount_cash || 0)
    upi += Number(sale.amount_upi || 0)
    card += Number(sale.amount_card || 0)

    const sid = sale.session_id || 'unknown'
    const s = sessionMap.get(sid) || {
      session: sid.slice(0, 8),
      orders: 0,
      revenue: 0,
    }
    s.orders += 1
    s.revenue += Number(sale.total || 0)
    sessionMap.set(sid, s)

    const lid = sale.location_id || 'store'
    const loc = locationMap.get(lid) || {
      pointOfSale: 'LFOUR37 Store',
      orders: 0,
      revenue: 0,
    }
    loc.orders += 1
    loc.revenue += Number(sale.total || 0)
    locationMap.set(lid, loc)

    const items = Array.isArray(sale.items) ? sale.items : []
    for (const item of items) {
      const name = item.product_name || 'Item'
      const p = productMap.get(name) || { product: name, qty: 0, revenue: 0 }
      p.qty += Number(item.quantity || 0)
      p.revenue += Number(item.line_total || 0)
      productMap.set(name, p)
    }
  }

  // Enrich session labels from pos_sessions if possible
  const sessionIds = Array.from(sessionMap.keys()).filter((id) => id !== 'unknown')
  if (sessionIds.length) {
    const { data: sessions } = await db
      .from('pos_sessions')
      .select('id, opened_at, location_id')
      .in('id', sessionIds)
    for (const sess of sessions || []) {
      const row = sessionMap.get(sess.id)
      if (row) {
        row.session = `Session ${formatDateInBusinessTz(new Date(sess.opened_at))}`
      }
    }
  }

  const topOrders = [...current]
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 15)
    .map((s) => ({
      sale_number: s.sale_number,
      date: s.created_at,
      payment_method: s.payment_method,
      total: round2(Number(s.total || 0)),
    }))

  return {
    view: 'pos' as const,
    range,
    previous,
    kpis: {
      orders: current.length,
      ordersDelta: pctDelta(current.length, prev.length),
      revenue: round2(revenue),
      revenueDelta: pctDelta(revenue, prevRevenue),
      averageTicket: round2(current.length ? revenue / current.length : 0),
      sessions: sessionMap.size,
      cash: round2(cash),
      upi: round2(upi),
      card: round2(card),
    },
    topOrders,
    topSessions: Array.from(sessionMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((r) => ({ ...r, revenue: round2(r.revenue) })),
    topPointsOfSale: Array.from(locationMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((r) => ({ ...r, revenue: round2(r.revenue) })),
    topProducts: Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((r) => ({ ...r, revenue: round2(r.revenue) })),
  }
}

export async function buildFinanceErpDashboard(
  db: SupabaseClient,
  range: DateRange,
  previous: DateRange
) {
  const fromIso = startOfBusinessDayIso(range.from)
  const toIso = endOfBusinessDayIso(range.to)
  const prevFromIso = startOfBusinessDayIso(previous.from)
  const prevToIso = endOfBusinessDayIso(previous.to)

  const [{ data: orders }, { data: prevOrders }, { data: posSales }, { data: payments }] =
    await Promise.all([
      db
        .from('orders')
        .select(
          'id, order_number, created_at, total, status, payment_method, payment_status, updated_at, shipping_address'
        )
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .limit(8000),
      db
        .from('orders')
        .select('id, total, status, payment_status, payment_method')
        .gte('created_at', prevFromIso)
        .lte('created_at', prevToIso)
        .limit(8000),
      db
        .from('pos_sales')
        .select('id, total, status, created_at')
        .eq('status', 'completed')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .limit(5000),
      db
        .from('payments')
        .select('id, amount, status, created_at, order_id')
        .eq('status', 'completed')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .limit(8000),
    ])

  const currentOrders = (orders || []).filter((o) => isCountableOrder(o.status))
  const prevCountable = (prevOrders || []).filter((o) => isCountableOrder(o.status))

  const invoicedOnline = currentOrders
    .filter(isPaidLike)
    .reduce((s, o) => s + Number(o.total || 0), 0)
  const invoicedPos = (posSales || []).reduce((s, o) => s + Number(o.total || 0), 0)
  const invoiced = invoicedOnline + invoicedPos

  const prevInvoiced =
    prevCountable.filter(isPaidLike).reduce((s, o) => s + Number(o.total || 0), 0)

  const unpaidOrders = currentOrders.filter(isUnpaid)
  const unpaid = unpaidOrders.reduce((s, o) => s + Number(o.total || 0), 0)
  const invoiceCount =
    currentOrders.filter(isPaidLike).length + (posSales || []).length
  const avgInvoice = invoiceCount ? invoiced / invoiceCount : 0

  // Rough DSO: average days from created_at to "paid" for paid orders in range
  let dsoDays = 0
  let dsoN = 0
  for (const o of currentOrders.filter(isPaidLike)) {
    const start = Date.parse(o.created_at)
    const end = Date.parse(o.updated_at || o.created_at)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    dsoDays += Math.max(0, (end - start) / 86400000)
    dsoN += 1
  }
  const dso = dsoN ? round2(dsoDays / dsoN) : 0

  const monthlyMap = new Map<string, number>()
  for (const o of currentOrders.filter(isPaidLike)) {
    const key = monthKey(o.created_at)
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(o.total || 0))
  }
  for (const s of posSales || []) {
    const key = monthKey(s.created_at)
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(s.total || 0))
  }
  const invoicedByMonth = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: round2(amount) }))

  const topInvoices = [
    ...currentOrders
      .filter(isPaidLike)
      .map((o) => ({
        reference: o.order_number,
        customer:
          (o.shipping_address as { full_name?: string } | null)?.full_name || '—',
        status: o.payment_status || o.status,
        date: o.created_at,
        amount: round2(Number(o.total || 0)),
        channel: 'online' as const,
      })),
    ...(posSales || []).map((s) => ({
      reference: `POS-${s.id.slice(0, 8)}`,
      customer: 'Walk-in',
      status: 'paid',
      date: s.created_at,
      amount: round2(Number(s.total || 0)),
      channel: 'pos' as const,
    })),
  ]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)

  const paymentCollected = (payments || []).reduce(
    (s, p) => s + Number(p.amount || 0),
    0
  )

  // Simplified profitability proxies (not full Odoo accounting)
  const income = round2(invoiced)
  const receivables = round2(unpaid)

  return {
    view: 'finance' as const,
    range,
    previous,
    kpis: {
      invoiced: round2(invoiced),
      invoicedDelta: pctDelta(invoiced, prevInvoiced),
      unpaid: round2(unpaid),
      averageInvoice: round2(avgInvoice),
      invoiceCount,
      dso,
      paymentCollected: round2(paymentCollected),
    },
    profitability: {
      income,
      costOfRevenue: null as number | null, // needs purchase cost rollup
      expenses: null as number | null, // needs expenses module
      netProfit: null as number | null,
      note: 'Full P&L / balance sheet needs Accounting + Expenses modules (later). Figures below are sales-based proxies.',
    },
    balanceProxies: {
      receivable: receivables,
      payables: null as number | null, // needs vendor bills
      netAssets: null as number | null,
    },
    invoicedByMonth,
    topInvoices,
    odooParity: {
      availableNow: [
        'Invoiced amount',
        'Unpaid / receivables (orders)',
        'Average invoice',
        'DSO (approx.)',
        'Invoiced by month',
        'Top invoices (orders + POS)',
      ],
      needsAccountingModule: [
        'Cash received / spent / bank balance',
        'Cost of revenue & true gross profit',
        'Expenses & net profit',
        'Debt to equity, solvency, liquidity ratios',
        'Payables & full balance sheet',
        'Benchmark / reinvoiced expenses',
      ],
    },
  }
}
