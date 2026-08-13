import type { SupabaseClient } from '@supabase/supabase-js'
import { channelFromAttribution } from '@/lib/attribution'
import {
  endOfBusinessDayIso,
  formatDateInBusinessTz,
  shiftBusinessDay,
  startOfBusinessDayIso,
} from '@/lib/timezone'
import { isDelhiveryRtoStatus } from '@/lib/delhivery-status'

export type DateRange = { from: string; to: string } // YYYY-MM-DD (IST)

function startOfDayIso(date: string) {
  return startOfBusinessDayIso(date)
}

function endOfDayIso(date: string) {
  return endOfBusinessDayIso(date)
}

function daysBetweenInclusive(from: string, to: string) {
  const fromMs = Date.parse(`${from}T12:00:00.000Z`)
  const toMs = Date.parse(`${to}T12:00:00.000Z`)
  return Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1)
}

export function resolveDatePreset(
  preset: string,
  customFrom?: string,
  customTo?: string,
  now = new Date()
): { range: DateRange; previous: DateRange; label: string } {
  const today = formatDateInBusinessTz(now)

  if (preset === 'custom' && customFrom && customTo) {
    const from = customFrom
    const to = customTo
    const days = daysBetweenInclusive(from, to)
    const prevTo = shiftBusinessDay(from, -1)
    const prevFrom = shiftBusinessDay(prevTo, -(days - 1))
    return {
      range: { from, to },
      previous: { from: prevFrom, to: prevTo },
      label: 'Custom',
    }
  }

  if (preset === 'today') {
    const prev = shiftBusinessDay(today, -1)
    return {
      range: { from: today, to: today },
      previous: { from: prev, to: prev },
      label: 'Today',
    }
  }

  if (preset === 'yesterday') {
    const y = shiftBusinessDay(today, -1)
    const prev = shiftBusinessDay(y, -1)
    return {
      range: { from: y, to: y },
      previous: { from: prev, to: prev },
      label: 'Yesterday',
    }
  }

  if (preset === '7d') {
    const from = shiftBusinessDay(today, -6)
    const prevTo = shiftBusinessDay(from, -1)
    const prevFrom = shiftBusinessDay(prevTo, -6)
    return {
      range: { from, to: today },
      previous: { from: prevFrom, to: prevTo },
      label: '7 Days',
    }
  }

  if (preset === 'this_month') {
    const from = `${today.slice(0, 8)}01`
    const days = daysBetweenInclusive(from, today)
    const prevTo = shiftBusinessDay(from, -1)
    const prevFrom = shiftBusinessDay(prevTo, -(days - 1))
    return {
      range: { from, to: today },
      previous: { from: prevFrom, to: prevTo },
      label: 'This Month',
    }
  }

  // default 30d
  const from = shiftBusinessDay(today, -29)
  const prevTo = shiftBusinessDay(from, -1)
  const prevFrom = shiftBusinessDay(prevTo, -29)
  return {
    range: { from, to: today },
    previous: { from: prevFrom, to: prevTo },
    label: '30 Days',
  }
}

function isExcludedStatus(status?: string | null) {
  return ['cancelled', 'refunded', 'returned'].includes(status || '')
}

function isRtoShipment(
  status?: string | null,
  instructions?: string | null,
  statusType?: string | null
) {
  return isDelhiveryRtoStatus(status || '', statusType, instructions)
}

/** Supabase may return a 1:1 embed as an object instead of an array. */
function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

type ShipmentRow = {
  status?: string | null
  status_type?: string | null
  awb?: string | null
  instructions?: string | null
  created_at?: string | null
}

type OrderRow = {
  id: string
  user_id: string
  status: string
  payment_method: string
  payment_status: string
  total: number
  subtotal: number
  discount_amount: number
  shipping_amount: number
  cod_advance_amount?: number | null
  cod_collect_amount?: number | null
  created_at: string
  shipped_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  tracking_number?: string | null
  shipping_address?: {
    city?: string
    postal_code?: string
    state?: string
  } | null
  utm_source?: string | null
  utm_campaign?: string | null
  meta_campaign_id?: string | null
  gclid?: string | null
  fbclid?: string | null
  items?: Array<{
    quantity: number
    total_price: number
    product_id: string | null
    product_name: string
    variant_size?: string | null
    variant_color?: string | null
    status?: string | null
    return_status?: string | null
    product?: { cost_price?: number | null; name?: string } | null
  }>
  delhivery_shipments?: ShipmentRow | ShipmentRow[] | null
}

export async function buildAdminDashboard(
  supabase: SupabaseClient,
  range: DateRange,
  previous: DateRange
) {
  const fromIso = startOfDayIso(range.from)
  const toIso = endOfDayIso(range.to)
  const prevFromIso = startOfDayIso(previous.from)
  const prevToIso = endOfDayIso(previous.to)

  const orderSelect = `
    id, user_id, status, payment_method, payment_status,
    total, subtotal, discount_amount, shipping_amount,
    cod_advance_amount, cod_collect_amount,
    created_at, shipped_at, delivered_at, cancelled_at, tracking_number,
    shipping_address,
    utm_source, utm_campaign, meta_campaign_id, gclid, fbclid,
    items:order_items(
      quantity, total_price, product_id, product_name,
      variant_size, variant_color, status, return_status,
      product:products(cost_price, name)
    ),
    delhivery_shipments(status, status_type, awb, instructions, created_at)
  `

  const [
    ordersRes,
    prevOrdersRes,
    seriesRes,
    eventsRes,
    spendRes,
    lowStockRes,
    firstOrdersRes,
    delayedShipmentsRes,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select(orderSelect)
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
    supabase
      .from('orders')
      .select(
        'id, total, payment_method, payment_status, status, created_at'
      )
      .gte('created_at', prevFromIso)
      .lte('created_at', prevToIso),
    supabase.rpc('get_dashboard_series', {
      from_date: range.from,
      to_date: range.to,
    }),
    supabase
      .from('analytics_events')
      .select('event_type, session_id, product_id, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .in('event_type', [
        'session_start',
        'page_view',
        'view_item',
        'add_to_cart',
        'begin_checkout',
        'purchase',
      ]),
    supabase
      .from('marketing_spend')
      .select('*')
      .gte('spend_date', range.from)
      .lte('spend_date', range.to),
    supabase
      .from('product_variants')
      .select(
        'id, product_id, stock, size, color, product:products(name)'
      )
      .lt('stock', 5)
      .eq('is_active', true)
      .order('stock')
      .limit(10),
    supabase
      .from('orders')
      .select('user_id, created_at')
      .or('payment_method.eq.cod,payment_status.eq.completed')
      .order('created_at', { ascending: true }),
    supabase
      .from('delhivery_shipments')
      .select('id, order_id, status, status_type, instructions, awb, created_at')
      .lt('created_at', new Date(Date.now() - 3 * 86400000).toISOString())
      .limit(100),
  ])

  const orders = ((ordersRes.data || []) as unknown as OrderRow[]).map(
    (order) => ({
      ...order,
      items: asArray(order.items),
      delhivery_shipments: asArray(order.delhivery_shipments),
    })
  )
  const prevOrders = (prevOrdersRes.data || []) as Array<{
    id: string
    total: number
    payment_method: string
    payment_status: string
    status: string
  }>
  const events = eventsRes.data || []
  const spendRows = spendRes.data || []

  const firstOrderByUser = new Map<string, string>()
  for (const row of firstOrdersRes.data || []) {
    if (!firstOrderByUser.has(row.user_id)) {
      firstOrderByUser.set(row.user_id, row.created_at)
    }
  }

  const SCOPE_HINT =
    'Same date range for all KPIs. Valid orders exclude cancelled / refunded / returned / RTO. Realised includes Partial COD shipping retained on RTO.'

  // --- Shared order sets (consistent scope) ---
  const placedOrders = orders
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled')
  const refundedOrders = orders.filter((o) => o.status === 'refunded')
  const returnedOrders = orders.filter((o) => o.status === 'returned')
  const pendingOrders = orders.filter((o) => o.status === 'pending')

  // Confirmed = accepted into fulfillment pipeline
  const confirmedOrders = orders.filter((o) =>
    ['paid', 'processing', 'shipped', 'delivered'].includes(o.status)
  )

  const isRtoOrder = (o: OrderRow) =>
    asArray(o.delhivery_shipments).some((sh) =>
      isRtoShipment(sh.status, sh.instructions, sh.status_type)
    )

  const rtoOrders = orders.filter(isRtoOrder)

  // Valid / ordered scope: exclude cancellations, returns, refunds, and RTO
  const validOrders = orders.filter(
    (o) => !isExcludedStatus(o.status) && !isRtoOrder(o)
  )

  const productValue = (o: OrderRow) => {
    const collect = Number(o.cod_collect_amount)
    if (Number.isFinite(collect) && collect > 0) return collect
    if (o.payment_method === 'cod') {
      return Math.max(0, Number(o.total || 0) - Number(o.shipping_amount || 0))
    }
    return Number(o.total || 0)
  }

  const rtoRetainedAdvance = (o: OrderRow) => {
    const advance = Number(o.cod_advance_amount)
    if (Number.isFinite(advance) && advance > 0) return advance
    if (o.payment_method === 'cod') return Number(o.shipping_amount || 0)
    return 0
  }

  // Funnel stages — each stage is a subset of the previous where possible
  const packedOrders = confirmedOrders.filter(
    (o) =>
      asArray(o.delhivery_shipments).length > 0 || Boolean(o.tracking_number)
  )
  const shippedOrders = confirmedOrders.filter(
    (o) => ['shipped', 'delivered'].includes(o.status) && !isRtoOrder(o)
  )
  const ofdOrders = shippedOrders.filter((o) =>
    asArray(o.delhivery_shipments).some((sh) => {
      if (isRtoShipment(sh.status, sh.instructions, sh.status_type)) return false
      const t = `${sh.status || ''} ${sh.instructions || ''}`.toLowerCase()
      return (
        t.includes('out for delivery') ||
        t.includes('dispatched') ||
        t.includes('ofd')
      )
    })
  )
  const deliveredOrders = confirmedOrders.filter(
    (o) => o.status === 'delivered'
  )

  const placed = placedOrders.length
  const confirmed = confirmedOrders.length
  const packed = packedOrders.length
  const shipped = shippedOrders.length
  const ofd = ofdOrders.length
  const delivered = deliveredOrders.length
  const cancelled = cancelledOrders.length
  const refunded = refundedOrders.length
  const returned = returnedOrders.length
  const pendingConfirmation = pendingOrders.length
  const rtoCount = rtoOrders.length

  // --- Revenue tiers ---
  const sumTotal = (list: OrderRow[]) =>
    list.reduce((s, o) => s + Number(o.total || 0), 0)
  const sumSubtotal = (list: OrderRow[]) =>
    list.reduce((s, o) => s + Number(o.subtotal || 0), 0)
  const sumDiscount = (list: OrderRow[]) =>
    list.reduce((s, o) => s + Number(o.discount_amount || 0), 0)

  const grossProductValue = sumSubtotal(placedOrders)
  const discounts = sumDiscount(placedOrders)
  const cancelledValue = cancelledOrders.reduce((s, o) => {
    if (isRtoOrder(o)) return s + productValue(o)
    return s + Number(o.total || 0)
  }, 0)
  const returnedValue = sumTotal(returnedOrders)
  const refundedValue = sumTotal(refundedOrders)
  const rtoProductLoss = rtoOrders.reduce((s, o) => s + productValue(o), 0)
  const rtoRetained = rtoOrders.reduce((s, o) => s + rtoRetainedAdvance(o), 0)
  // RTO product already in cancelledValue; only add remaining RTO still showing as shipped
  const rtoExtraValue = rtoOrders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'returned')
    .reduce((s, o) => s + productValue(o), 0)

  // Reconciles: Gross product − discounts − cancelled − returned − refunded − extra RTO
  const netOrderRevenue =
    grossProductValue -
    discounts -
    cancelledValue -
    returnedValue -
    refundedValue -
    rtoExtraValue

  const orderedRevenue = sumTotal(validOrders)
  const shippedRevenue = sumTotal(shippedOrders)
  const realisedRevenue = sumTotal(deliveredOrders) + rtoRetained

  const prevValid = prevOrders.filter((o) => !isExcludedStatus(o.status))
  const prevOrderedRevenue = prevValid.reduce(
    (s, o) => s + Number(o.total || 0),
    0
  )

  const orderCountPlaced = placed
  const orderCountValid = validOrders.length
  const aov =
    orderCountValid > 0 ? orderedRevenue / orderCountValid : 0

  // Items sold on SAME scope as valid/ordered revenue
  let itemsSold = 0
  let cogs = 0
  let hasAnyCost = false
  const sizeCounts = new Map<string, number>()
  const colorCounts = new Map<string, number>()
  const productStats = new Map<
    string,
    {
      productId: string
      name: string
      units: number
      orders: Set<string>
      revenue: number
      returns: number
    }
  >()

  for (const order of validOrders) {
    for (const item of order.items || []) {
      if (item.status === 'cancelled') continue
      const qty = Number(item.quantity || 0)
      itemsSold += qty
      const cost = Number(item.product?.cost_price || 0)
      if (item.product?.cost_price != null && Number(item.product.cost_price) > 0) {
        hasAnyCost = true
      }
      cogs += cost * qty

      if (item.variant_size) {
        sizeCounts.set(
          item.variant_size,
          (sizeCounts.get(item.variant_size) || 0) + qty
        )
      }
      if (item.variant_color) {
        colorCounts.set(
          item.variant_color,
          (colorCounts.get(item.variant_color) || 0) + qty
        )
      }

      const pid = item.product_id || item.product_name
      const existing = productStats.get(pid) || {
        productId: item.product_id || pid,
        name: item.product?.name || item.product_name,
        units: 0,
        orders: new Set<string>(),
        revenue: 0,
        returns: 0,
      }
      existing.units += qty
      existing.orders.add(order.id)
      existing.revenue += Number(item.total_price || 0)
      if (
        item.status === 'returned' ||
        item.return_status === 'return_requested' ||
        item.return_status === 'return_approved'
      ) {
        existing.returns += 1
      }
      productStats.set(pid, existing)
    }
  }

  const shippingCost = validOrders.reduce(
    (s, o) => s + Number(o.shipping_amount || 0),
    0
  )
  const adsSpend = spendRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const contribution =
    hasAnyCost || adsSpend > 0 || shippingCost > 0
      ? orderedRevenue - cogs - shippingCost - adsSpend
      : null
  const contributionMarginPct =
    contribution != null && orderedRevenue > 0
      ? (contribution / orderedRevenue) * 100
      : null

  const contributionBreakdown = {
    orderedRevenue,
    cogs,
    shipping: shippingCost,
    adsSpend,
    contribution,
    contributionMarginPct,
    hasCostData: hasAnyCost,
  }

  // New vs repeat among valid orders
  let newCustomers = 0
  let repeatCustomers = 0
  const buyers = new Set<string>()
  for (const order of validOrders) {
    if (buyers.has(order.user_id)) continue
    buyers.add(order.user_id)
    const firstAt = firstOrderByUser.get(order.user_id)
    const isNew = firstAt && firstAt >= fromIso && firstAt <= toIso
    if (isNew) newCustomers += 1
    else repeatCustomers += 1
  }

  const sessionIds = new Set(
    events
      .map((e) => e.session_id)
      .filter((id): id is string => Boolean(id))
  )
  const sessionCount = sessionIds.size
  const pageViews = events.filter((e) => e.event_type === 'page_view').length
  const sessions =
    sessionCount ||
    events.filter((e) => e.event_type === 'session_start').length ||
    pageViews

  const viewItemEvents = events.filter((e) => e.event_type === 'view_item')
  const sessionsWithProductView = new Set(
    viewItemEvents.map((e) => e.session_id).filter(Boolean)
  ).size
  const productViews = viewItemEvents.length
  const addToCart = events.filter((e) => e.event_type === 'add_to_cart').length
  const checkoutStarted = events.filter(
    (e) => e.event_type === 'begin_checkout'
  ).length
  const trackedPurchases = events.filter(
    (e) => e.event_type === 'purchase'
  ).length

  // Tracking is incomplete if we have orders but ATC/checkout/purchase events don't make sense
  const trackingIncomplete =
    addToCart === 0 ||
    checkoutStarted === 0 ||
    (orderCountValid > 0 && trackedPurchases === 0) ||
    (trackedPurchases > 0 &&
      checkoutStarted === 0 &&
      addToCart < trackedPurchases)

  const websitePurchaseConversion =
    sessions > 0 ? (orderCountValid / sessions) * 100 : null

  const cancellationRate = placed > 0 ? (cancelled / placed) * 100 : 0
  const deliveryOutcomes = delivered + rtoCount
  const rtoRate =
    deliveryOutcomes > 0 ? (rtoCount / deliveryOutcomes) * 100 : 0
  const deliveryRate =
    deliveryOutcomes > 0 ? (delivered / deliveryOutcomes) * 100 : 0

  // COD vs prepaid — placed counts match COD+Prepaid = Placed
  const byPay = (method: 'cod' | 'prepaid') => {
    const subset = orders.filter((o) =>
      method === 'cod'
        ? o.payment_method === 'cod'
        : o.payment_method !== 'cod'
    )
    const subsetValid = subset.filter((o) => !isExcludedStatus(o.status))
    const subsetConfirmed = subset.filter((o) =>
      ['paid', 'processing', 'shipped', 'delivered'].includes(o.status)
    )
    const subsetDelivered = subset.filter((o) => o.status === 'delivered')
    const subsetCancelled = subset.filter((o) => o.status === 'cancelled')
    const subsetPending = subset.filter((o) => o.status === 'pending')
    const subsetShipped = subset.filter((o) =>
      ['shipped', 'delivered'].includes(o.status)
    )
    const subsetRto = subset.filter(isRtoOrder)
    const subsetInTransit = subset.filter(
      (o) => o.status === 'shipped' && !isRtoOrder(o)
    )
    const cancelledBeforeShip = subset.filter(
      (o) =>
        o.status === 'cancelled' &&
        !['shipped', 'delivered'].includes(o.status)
    )

    return {
      orders: subset.length,
      revenue: sumTotal(subsetValid),
      delivered: subsetDelivered.length,
      rto: subsetRto.length,
      rtoRate:
        subsetShipped.length > 0
          ? (subsetRto.length / subsetShipped.length) * 100
          : 0,
      confirmationRate:
        subset.length > 0
          ? (subsetConfirmed.length / subset.length) * 100
          : 0,
      pendingConfirmation: subsetPending.length,
      cancelledBeforeShippingPct:
        subset.length > 0
          ? (cancelledBeforeShip.length / subset.length) * 100
          : 0,
      deliveredPct:
        subset.length > 0
          ? (subsetDelivered.length / subset.length) * 100
          : 0,
      valueAtRisk: sumTotal(subsetInTransit),
      inTransit: subsetInTransit.length,
      cancelled: subsetCancelled.length,
    }
  }

  const codStats = byPay('cod')
  const prepaidStats = byPay('prepaid')
  const payTotal = placed || 1

  const rate = (num: number, den: number) =>
    den > 0 ? (num / den) * 100 : null

  // Series
  const seriesRaw = seriesRes.error ? [] : seriesRes.data || []
  const series = seriesRaw.map((row: any) => ({
    date: row.date,
    revenue: Number(row.revenue || 0),
    orders: Number(row.orders || 0),
    aov: Number(row.aov || 0),
    units_sold: Number(row.units_sold || 0),
    profit:
      Number(row.profit || 0) -
      (adsSpend > 0 ? adsSpend / Math.max(1, seriesRaw.length) : 0),
  }))

  // Attribution
  const channelMap = new Map<
    string,
    { orders: number; revenue: number; channelKey: string }
  >()
  for (const order of validOrders) {
    const label = channelFromAttribution({
      utm_source: order.utm_source,
      gclid: order.gclid,
      fbclid: order.fbclid,
      meta_campaign_id: order.meta_campaign_id,
    })
    const existing = channelMap.get(label) || {
      orders: 0,
      revenue: 0,
      channelKey: label,
    }
    existing.orders += 1
    existing.revenue += Number(order.total || 0)
    channelMap.set(label, existing)
  }

  const spendByChannel = {
    meta: spendRows
      .filter((r) => r.channel === 'meta')
      .reduce((s, r) => s + Number(r.amount || 0), 0),
    google: spendRows
      .filter((r) => r.channel === 'google')
      .reduce((s, r) => s + Number(r.amount || 0), 0),
    other: spendRows
      .filter((r) => r.channel === 'other')
      .reduce((s, r) => s + Number(r.amount || 0), 0),
  }

  const attribution = Array.from(channelMap.values())
    .map((row) => {
      let spend = 0
      if (row.channelKey === 'Meta Ads') spend = spendByChannel.meta
      else if (row.channelKey === 'Google') spend = spendByChannel.google
      else if (row.channelKey.toLowerCase().includes('other'))
        spend = spendByChannel.other

      return {
        channel: row.channelKey,
        orders: row.orders,
        revenue: row.revenue,
        spend: spend || null,
        roas: spend > 0 ? row.revenue / spend : null,
        cpa: spend > 0 && row.orders > 0 ? spend / row.orders : null,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const viewCounts = new Map<string, number>()
  const atcCounts = new Map<string, number>()
  for (const e of events) {
    if (!e.product_id) continue
    if (e.event_type === 'view_item') {
      viewCounts.set(e.product_id, (viewCounts.get(e.product_id) || 0) + 1)
    }
    if (e.event_type === 'add_to_cart') {
      atcCounts.set(e.product_id, (atcCounts.get(e.product_id) || 0) + 1)
    }
  }

  const topProducts = Array.from(productStats.values())
    .map((p) => {
      const views = viewCounts.get(p.productId) || 0
      return {
        productId: p.productId,
        name: p.name,
        units: p.units,
        orders: p.orders.size,
        revenue: p.revenue,
        returns: p.returns,
        conversion: trackingIncomplete
          ? null
          : views > 0
            ? (p.orders.size / views) * 100
            : null,
        trackingUnavailable: trackingIncomplete,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const sizeSalesTotal = [...sizeCounts.values()].reduce((a, b) => a + b, 0)
  const sizeSales = [...sizeCounts.entries()]
    .map(([size, units]) => ({
      size,
      units,
      pct: sizeSalesTotal > 0 ? (units / sizeSalesTotal) * 100 : 0,
    }))
    .sort((a, b) => b.units - a.units)

  const topBy = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null

  const mostViewedId = topBy(viewCounts)
  const mostAtcId = topBy(atcCounts)
  const highestReturn = [...productStats.values()].sort(
    (a, b) => b.returns - a.returns
  )[0]

  const cityMap = new Map<string, { orders: number; revenue: number }>()
  const pinMap = new Map<string, { orders: number; revenue: number }>()
  const stateMap = new Map<
    string,
    { orders: number; revenue: number; cod: number; rto: number }
  >()
  for (const order of validOrders) {
    const city = order.shipping_address?.city?.trim() || 'Unknown'
    const pin = order.shipping_address?.postal_code?.trim() || 'Unknown'
    const state = order.shipping_address?.state?.trim() || 'Unknown'
    const c = cityMap.get(city) || { orders: 0, revenue: 0 }
    c.orders += 1
    c.revenue += Number(order.total || 0)
    cityMap.set(city, c)
    const p = pinMap.get(pin) || { orders: 0, revenue: 0 }
    p.orders += 1
    p.revenue += Number(order.total || 0)
    pinMap.set(pin, p)
    const st = stateMap.get(state) || {
      orders: 0,
      revenue: 0,
      cod: 0,
      rto: 0,
    }
    st.orders += 1
    st.revenue += Number(order.total || 0)
    if (order.payment_method === 'cod') st.cod += 1
    if (isRtoOrder(order)) st.rto += 1
    stateMap.set(state, st)
  }

  const topCities = [...cityMap.entries()]
    .map(([city, v]) => ({ city, ...v }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 8)
  const topPins = [...pinMap.entries()]
    .map(([pin, v]) => ({ pin, ...v }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 8)
  const topStates = [...stateMap.entries()]
    .map(([state, v]) => ({
      state,
      orders: v.orders,
      revenue: v.revenue,
      aov: v.orders > 0 ? v.revenue / v.orders : 0,
      codPct: v.orders > 0 ? (v.cod / v.orders) * 100 : 0,
      rtoPct: v.orders > 0 ? (v.rto / v.orders) * 100 : 0,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 8)

  const uniqueCustomers = buyers.size
  const avgCustomerSpend =
    uniqueCustomers > 0 ? orderedRevenue / uniqueCustomers : 0
  const ordersPerCustomer =
    uniqueCustomers > 0 ? orderCountValid / uniqueCustomers : 0
  const repeatPurchaseRate =
    uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0

  const packedNotShipped = packedOrders.filter(
    (o) => !['shipped', 'delivered'].includes(o.status) && !isRtoOrder(o)
  ).length
  const inTransit = orders.filter(
    (o) => o.status === 'shipped' && !isRtoOrder(o)
  ).length
  const returnsNeedingAction = orders.filter((o) =>
    (o.items || []).some(
      (i) =>
        i.return_status === 'return_requested' ||
        i.return_status === 'return_approved'
    )
  ).length

  const now = Date.now()
  const hoursSince = (iso?: string | null) =>
    iso ? (now - new Date(iso).getTime()) / 3600000 : 0

  const packedOver24h = packedOrders.filter(
    (o) =>
      !['shipped', 'delivered'].includes(o.status) &&
      hoursSince(
        asArray(o.delhivery_shipments)[0]?.created_at || o.created_at
      ) > 24
  ).length
  const shippedOver5d = orders.filter(
    (o) =>
      o.status === 'shipped' &&
      !isRtoOrder(o) &&
      hoursSince(o.shipped_at || o.created_at) > 120
  ).length
  const ofdNotDelivered = ofdOrders.filter((o) => o.status !== 'delivered').length

  const delayedShipments = (delayedShipmentsRes.data || []).filter((sh) => {
    return !isDelhiveryRtoStatus(
      sh.status || '',
      sh.status_type,
      sh.instructions
    ) && !`${sh.status || ''}`.toLowerCase().includes('delivered')
      && !`${sh.status || ''}`.toLowerCase().includes('cancel')
  }).length

  const reconciliationCheck =
    grossProductValue -
    discounts -
    cancelledValue -
    returnedValue -
    refundedValue -
    rtoExtraValue

  return {
    range,
    previous,
    scopeHint: SCOPE_HINT,
    kpis: {
      ordersPlaced: orderCountPlaced,
      ordersConfirmed: confirmed,
      ordersPending: pendingConfirmation,
      ordersCancelled: cancelled,
      orderedRevenue,
      shippedRevenue,
      realisedRevenue,
      aov,
      itemsSold,
      newCustomers,
      repeatCustomers,
      websitePurchaseConversion: trackingIncomplete
        ? null
        : websitePurchaseConversion,
      contribution,
      contributionMarginPct,
      delivered,
      cancelled,
      rto: rtoCount,
      prevOrderedRevenue,
      revenueDelta: orderedRevenue - prevOrderedRevenue,
      // legacy aliases kept for safer UI rollout
      netRevenue: orderedRevenue,
      orders: orderCountPlaced,
    },
    revenueTiers: {
      ordered: orderedRevenue,
      shipped: shippedRevenue,
      realised: realisedRevenue,
    },
    orderedVsRealised: {
      grossProductValue,
      discounts,
      cancelled: cancelledValue,
      returned: returnedValue,
      refunded: refundedValue,
      rtoExtra: rtoExtraValue,
      rtoRetained,
      rtoProductLoss,
      netOrderRevenue,
      reconciliationCheck,
      discountsNote:
        'Discounts are deducted from gross product value before cancellations.',
      realisedRevenue,
      shippedRevenue,
      orderedRevenue,
    },
    contributionBreakdown,
    orderFunnel: {
      placed,
      confirmed,
      packed,
      shipped,
      outForDelivery: ofd,
      delivered,
      cancelled,
      pending: pendingConfirmation,
      rto: rtoCount,
      returned,
      refunded,
      cancellationRate,
      rtoRate,
      deliveryRate,
    },
    paymentSplit: {
      cod: codStats,
      prepaid: prepaidStats,
      codOrderPct: (codStats.orders / payTotal) * 100,
      prepaidOrderPct: (prepaidStats.orders / payTotal) * 100,
    },
    websiteFunnel: {
      sessions,
      productViews,
      sessionsWithProductView,
      productViewerRate: rate(sessionsWithProductView, sessions),
      viewsPerVisitor: sessions > 0 ? productViews / sessions : null,
      addToCart,
      checkoutStarted,
      purchases: trackedPurchases,
      ordersInRange: orderCountValid,
      addToCartRate: trackingIncomplete
        ? null
        : rate(addToCart, Math.max(sessionsWithProductView, 1)),
      checkoutRate: trackingIncomplete
        ? null
        : rate(checkoutStarted, Math.max(addToCart, 1)),
      purchaseRate: trackingIncomplete
        ? null
        : rate(trackedPurchases, Math.max(checkoutStarted, 1)),
      websitePurchaseConversion: trackingIncomplete
        ? null
        : websitePurchaseConversion,
      trackingIncomplete,
      note: trackingIncomplete
        ? 'Funnel tracking incomplete — AddToCart / BeginCheckout / Purchase events need attention. Rates hidden until reliable.'
        : undefined,
    },
    series,
    comparison: {
      currentRevenue: orderedRevenue,
      previousRevenue: prevOrderedRevenue,
      delta: orderedRevenue - prevOrderedRevenue,
    },
    attribution,
    marketingSpend: spendRows,
    topProducts,
    sizeSales,
    productInsights: {
      bestSize: topBy(sizeCounts),
      bestColor: topBy(colorCounts),
      mostViewedProductId: mostViewedId,
      mostAddedToCartProductId: mostAtcId,
      highestConverting: trackingIncomplete
        ? null
        : topProducts.find((p) => p.conversion != null) || null,
      highestReturned: highestReturn
        ? {
            name: highestReturn.name,
            returns: highestReturn.returns,
          }
        : null,
    },
    customers: {
      newCustomers,
      repeatCustomers,
      repeatPurchaseRate,
      avgCustomerSpend,
      ordersPerCustomer,
      topCities,
      topPins,
      topStates,
    },
    shipmentAgeing: {
      packedOver24h,
      shippedOver5d,
      ofdNotDelivered,
    },
    alerts: {
      codAwaitingConfirmation: codStats.pendingConfirmation,
      packedNotShipped,
      inTransit,
      cancelled,
      delayedShipments,
      rtoShipments: rtoCount,
      readyToShip: packedNotShipped,
      returnsNeedingAction,
      lowStockCount: lowStockRes.data?.length || 0,
      links: {
        pending: '/admin/orders?status=pending',
        processing: '/admin/orders?status=processing',
        shipped: '/admin/orders?status=shipped',
        cancelled: '/admin/orders?status=cancelled',
        delivered: '/admin/orders?status=delivered',
        rto: '/admin/orders?status=rto',
      },
    },
    lowStock: lowStockRes.data || [],
  }
}
