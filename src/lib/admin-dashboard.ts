import type { SupabaseClient } from '@supabase/supabase-js'
import { channelFromAttribution } from '@/lib/attribution'

export type DateRange = { from: string; to: string } // YYYY-MM-DD

function startOfDayIso(date: string) {
  return `${date}T00:00:00.000Z`
}

function endOfDayIso(date: string) {
  return `${date}T23:59:59.999Z`
}

function parseDay(date: string) {
  return new Date(`${date}T12:00:00.000Z`)
}

function formatDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function resolveDatePreset(
  preset: string,
  customFrom?: string,
  customTo?: string,
  now = new Date()
): { range: DateRange; previous: DateRange; label: string } {
  const today = formatDay(now)

  if (preset === 'custom' && customFrom && customTo) {
    const from = customFrom
    const to = customTo
    const days =
      Math.max(
        1,
        Math.round(
          (parseDay(to).getTime() - parseDay(from).getTime()) / 86400000
        ) + 1
      )
    const prevTo = formatDay(new Date(parseDay(from).getTime() - 86400000))
    const prevFrom = formatDay(
      new Date(parseDay(prevTo).getTime() - (days - 1) * 86400000)
    )
    return {
      range: { from, to },
      previous: { from: prevFrom, to: prevTo },
      label: 'Custom',
    }
  }

  if (preset === 'today') {
    const prev = formatDay(new Date(parseDay(today).getTime() - 86400000))
    return {
      range: { from: today, to: today },
      previous: { from: prev, to: prev },
      label: 'Today',
    }
  }

  if (preset === 'yesterday') {
    const y = formatDay(new Date(parseDay(today).getTime() - 86400000))
    const prev = formatDay(new Date(parseDay(y).getTime() - 86400000))
    return {
      range: { from: y, to: y },
      previous: { from: prev, to: prev },
      label: 'Yesterday',
    }
  }

  if (preset === '7d') {
    const from = formatDay(new Date(parseDay(today).getTime() - 6 * 86400000))
    const prevTo = formatDay(new Date(parseDay(from).getTime() - 86400000))
    const prevFrom = formatDay(
      new Date(parseDay(prevTo).getTime() - 6 * 86400000)
    )
    return {
      range: { from, to: today },
      previous: { from: prevFrom, to: prevTo },
      label: '7 Days',
    }
  }

  if (preset === 'this_month') {
    const from = `${today.slice(0, 8)}01`
    const days =
      Math.round(
        (parseDay(today).getTime() - parseDay(from).getTime()) / 86400000
      ) + 1
    const prevTo = formatDay(new Date(parseDay(from).getTime() - 86400000))
    const prevFrom = formatDay(
      new Date(parseDay(prevTo).getTime() - (days - 1) * 86400000)
    )
    return {
      range: { from, to: today },
      previous: { from: prevFrom, to: prevTo },
      label: 'This Month',
    }
  }

  // default 30d
  const from = formatDay(new Date(parseDay(today).getTime() - 29 * 86400000))
  const prevTo = formatDay(new Date(parseDay(from).getTime() - 86400000))
  const prevFrom = formatDay(
    new Date(parseDay(prevTo).getTime() - 29 * 86400000)
  )
  return {
    range: { from, to: today },
    previous: { from: prevFrom, to: prevTo },
    label: '30 Days',
  }
}

function isBookedRevenue(order: {
  payment_method?: string | null
  payment_status?: string | null
}) {
  return (
    order.payment_method === 'cod' || order.payment_status === 'completed'
  )
}

function isExcludedStatus(status?: string | null) {
  return ['cancelled', 'refunded', 'returned'].includes(status || '')
}

function isRtoShipment(status?: string | null, instructions?: string | null) {
  const text = `${status || ''} ${instructions || ''}`.toLowerCase()
  return text.includes('rto') || text.includes('return to origin')
}

/** Supabase may return a 1:1 embed as an object instead of an array. */
function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

type ShipmentRow = {
  status?: string | null
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
    created_at, shipped_at, delivered_at, cancelled_at, tracking_number,
    shipping_address,
    utm_source, utm_campaign, meta_campaign_id, gclid, fbclid,
    items:order_items(
      quantity, total_price, product_id, product_name,
      variant_size, variant_color, status, return_status,
      product:products(cost_price, name)
    ),
    delhivery_shipments(status, awb, instructions, created_at)
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
      .select('id, order_id, status, awb, created_at')
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

  const successful = orders.filter(
    (o) => isBookedRevenue(o) && !isExcludedStatus(o.status)
  )
  const prevSuccessful = prevOrders.filter(
    (o) => isBookedRevenue(o) && !isExcludedStatus(o.status)
  )

  const netRevenue = successful.reduce((s, o) => s + Number(o.total || 0), 0)
  const prevNetRevenue = prevSuccessful.reduce(
    (s, o) => s + Number(o.total || 0),
    0
  )
  const orderCount = successful.length
  const aov = orderCount > 0 ? netRevenue / orderCount : 0

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

  for (const order of successful) {
    for (const item of order.items || []) {
      if (item.status === 'cancelled') continue
      const qty = Number(item.quantity || 0)
      itemsSold += qty
      const cost = Number(item.product?.cost_price || 0)
      if (item.product?.cost_price != null) hasAnyCost = true
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

  const shippingCost = successful.reduce(
    (s, o) => s + Number(o.shipping_amount || 0),
    0
  )
  const adsSpend = spendRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const contribution =
    hasAnyCost || adsSpend > 0 || shippingCost > 0
      ? netRevenue - cogs - shippingCost - adsSpend
      : null

  // New vs repeat among successful orders in range
  let newCustomers = 0
  let repeatCustomers = 0
  const buyers = new Set<string>()
  for (const order of successful) {
    if (buyers.has(order.user_id)) continue
    buyers.add(order.user_id)
    const firstAt = firstOrderByUser.get(order.user_id)
    const isNew =
      firstAt &&
      firstAt >= fromIso &&
      firstAt <= toIso
    if (isNew) newCustomers += 1
    else repeatCustomers += 1
  }

  const sessions = new Set(
    events
      .filter((e) => e.event_type === 'session_start' || e.event_type === 'page_view')
      .map((e) => e.session_id)
      .filter(Boolean)
  )
  const sessionCount = sessions.size || events.filter((e) => e.event_type === 'page_view').length
  const conversionRate =
    sessionCount > 0 ? (orderCount / sessionCount) * 100 : null

  // Ordered vs realised
  const grossOrdered = orders.reduce((s, o) => s + Number(o.total || 0), 0)
  const cancelledRevenue = orders
    .filter((o) => o.status === 'cancelled')
    .reduce((s, o) => s + Number(o.total || 0), 0)
  const returnedRevenue = orders
    .filter((o) => o.status === 'returned' || o.status === 'refunded')
    .reduce((s, o) => s + Number(o.total || 0), 0)
  const rtoOrders = orders.filter((o) =>
    asArray(o.delhivery_shipments).some((sh) =>
      isRtoShipment(sh.status, sh.instructions)
    )
  )
  const rtoRevenue = rtoOrders.reduce((s, o) => s + Number(o.total || 0), 0)
  const discountTotal = orders.reduce(
    (s, o) => s + Number(o.discount_amount || 0),
    0
  )

  // Order funnel
  const placed = orders.length
  const confirmed = orders.filter((o) =>
    ['paid', 'processing', 'shipped', 'delivered'].includes(o.status)
  ).length
  const packed = orders.filter(
    (o) =>
      asArray(o.delhivery_shipments).length > 0 || Boolean(o.tracking_number)
  ).length
  const shipped = orders.filter((o) =>
    ['shipped', 'delivered'].includes(o.status)
  ).length
  const ofd = orders.filter((o) =>
    asArray(o.delhivery_shipments).some((sh) => {
      const t = `${sh.status || ''} ${sh.instructions || ''}`.toLowerCase()
      return (
        t.includes('out for delivery') ||
        t.includes('dispatched') ||
        t.includes('ofd')
      )
    })
  ).length
  const delivered = orders.filter((o) => o.status === 'delivered').length
  const cancelled = orders.filter((o) => o.status === 'cancelled').length
  const returned = orders.filter(
    (o) =>
      o.status === 'returned' ||
      (o.items || []).some(
        (i) =>
          i.status === 'returned' ||
          i.return_status === 'return_approved' ||
          i.return_status === 'return_requested'
      )
  ).length
  const refunded = orders.filter((o) => o.status === 'refunded').length
  const rtoCount = rtoOrders.length

  const cancellationRate = placed > 0 ? (cancelled / placed) * 100 : 0
  const rtoRate = shipped > 0 ? (rtoCount / shipped) * 100 : 0
  const deliveryRate = shipped > 0 ? (delivered / shipped) * 100 : 0

  // COD vs prepaid
  const byPay = (method: 'cod' | 'prepaid') => {
    const subset = orders.filter((o) =>
      method === 'cod'
        ? o.payment_method === 'cod'
        : o.payment_method !== 'cod'
    )
    const subsetSuccess = subset.filter(
      (o) => isBookedRevenue(o) && !isExcludedStatus(o.status)
    )
    const subsetDelivered = subset.filter((o) => o.status === 'delivered').length
    const subsetRto = subset.filter((o) =>
      asArray(o.delhivery_shipments).some((sh) =>
        isRtoShipment(sh.status, sh.instructions)
      )
    ).length
    const subsetShipped = subset.filter((o) =>
      ['shipped', 'delivered', 'cancelled', 'returned'].includes(o.status)
    ).length
    const confirmedCod = subset.filter((o) =>
      ['processing', 'shipped', 'delivered', 'paid'].includes(o.status)
    ).length

    return {
      orders: subset.length,
      revenue: subsetSuccess.reduce((s, o) => s + Number(o.total || 0), 0),
      delivered: subsetDelivered,
      rto: subsetRto,
      rtoRate: subsetShipped > 0 ? (subsetRto / subsetShipped) * 100 : 0,
      confirmationRate:
        subset.length > 0 ? (confirmedCod / subset.length) * 100 : 0,
    }
  }

  const codStats = byPay('cod')
  const prepaidStats = byPay('prepaid')
  const payTotal = orders.length || 1

  // Website funnel
  const countEvents = (type: string) =>
    events.filter((e) => e.event_type === type).length
  const websiteFunnel = {
    sessions: sessionCount,
    productViews: countEvents('view_item'),
    addToCart: countEvents('add_to_cart'),
    checkoutStarted: countEvents('begin_checkout'),
    purchases: countEvents('purchase') || orderCount,
  }
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
  for (const order of successful) {
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

  // Product performance
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
        conversion: views > 0 ? (p.orders.size / views) * 100 : null,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const topBy = <T,>(map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null

  const mostViewedId = topBy(viewCounts)
  const mostAtcId = topBy(atcCounts)
  const highestReturn = [...productStats.values()].sort(
    (a, b) => b.returns - a.returns
  )[0]

  // Geo
  const cityMap = new Map<string, { orders: number; revenue: number }>()
  const pinMap = new Map<string, { orders: number; revenue: number }>()
  for (const order of successful) {
    const city = order.shipping_address?.city?.trim() || 'Unknown'
    const pin = order.shipping_address?.postal_code?.trim() || 'Unknown'
    const c = cityMap.get(city) || { orders: 0, revenue: 0 }
    c.orders += 1
    c.revenue += Number(order.total || 0)
    cityMap.set(city, c)
    const p = pinMap.get(pin) || { orders: 0, revenue: 0 }
    p.orders += 1
    p.revenue += Number(order.total || 0)
    pinMap.set(pin, p)
  }

  const topCities = [...cityMap.entries()]
    .map(([city, v]) => ({ city, ...v }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 8)
  const topPins = [...pinMap.entries()]
    .map(([pin, v]) => ({ pin, ...v }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 8)

  const uniqueCustomers = buyers.size
  const avgCustomerSpend =
    uniqueCustomers > 0 ? netRevenue / uniqueCustomers : 0
  const ordersPerCustomer =
    uniqueCustomers > 0 ? orderCount / uniqueCustomers : 0
  const repeatPurchaseRate =
    uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0

  // Alerts
  const codAwaiting = orders.filter(
    (o) =>
      o.payment_method === 'cod' &&
      (o.status === 'pending' ||
        (o.status === 'processing' &&
          asArray(o.delhivery_shipments).length === 0))
  ).length
  const readyToShip = orders.filter(
    (o) =>
      o.status === 'processing' &&
      !asArray(o.delhivery_shipments).some((s) => s.awb)
  ).length
  const delayedShipments = (delayedShipmentsRes.data || []).filter((sh) => {
    const t = `${sh.status || ''}`.toLowerCase()
    return (
      !t.includes('delivered') &&
      !t.includes('rto') &&
      !t.includes('cancel') &&
      !t.includes('return to origin')
    )
  }).length

  return {
    range,
    previous,
    kpis: {
      netRevenue,
      orders: orderCount,
      aov,
      itemsSold,
      newCustomers,
      repeatCustomers,
      conversionRate,
      contribution,
      delivered,
      cancelled,
      rto: rtoCount,
      prevNetRevenue,
      revenueDelta: netRevenue - prevNetRevenue,
    },
    orderedVsRealised: {
      grossOrdered,
      cancelled: cancelledRevenue,
      returnedRto: returnedRevenue + rtoRevenue,
      discounts: discountTotal,
      netRealised: netRevenue,
    },
    orderFunnel: {
      placed,
      confirmed,
      packed,
      shipped,
      outForDelivery: ofd,
      delivered,
      cancelled,
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
      ...websiteFunnel,
      productViewRate: rate(websiteFunnel.productViews, websiteFunnel.sessions),
      addToCartRate: rate(websiteFunnel.addToCart, websiteFunnel.productViews),
      checkoutRate: rate(
        websiteFunnel.checkoutStarted,
        websiteFunnel.addToCart
      ),
      purchaseRate: rate(
        websiteFunnel.purchases,
        websiteFunnel.checkoutStarted
      ),
      note: 'Funnel fills after tracking deploy',
    },
    series,
    comparison: {
      currentRevenue: netRevenue,
      previousRevenue: prevNetRevenue,
      delta: netRevenue - prevNetRevenue,
    },
    attribution,
    marketingSpend: spendRows,
    topProducts,
    productInsights: {
      bestSize: topBy(sizeCounts),
      bestColor: topBy(colorCounts),
      mostViewedProductId: mostViewedId,
      mostAddedToCartProductId: mostAtcId,
      highestConverting: topProducts.find((p) => p.conversion != null) || null,
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
    },
    alerts: {
      codAwaitingConfirmation: codAwaiting,
      delayedShipments,
      rtoShipments: rtoCount,
      readyToShip,
      lowStockCount: lowStockRes.data?.length || 0,
    },
    lowStock: lowStockRes.data || [],
  }
}
