import { createClient } from '@/lib/supabase/server'
import { areAllOrderItemsCancelled } from '@/lib/order-status'
import { isDelhiveryRtoStatus } from '@/lib/delhivery-status'
import {
  ADMIN_ORDERS_PAGE_SIZE,
  type AdminOrdersQuery,
} from '@/lib/admin-orders'
import logger from '@/lib/logger'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const EMPTY_ID = '00000000-0000-0000-0000-000000000000'

const ORDER_SELECT = `
  *,
  user:users(
    id,
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
    return_requested_at,
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
  payment:payments(
    id,
    status,
    payment_method,
    amount,
    razorpay_payment_id,
    stripe_payment_intent_id,
    refunded_amount
  ),
  delhivery_shipment:delhivery_shipments(
    id,
    awb,
    carrier,
    status,
    status_code,
    status_type,
    instructions,
    expected_delivery_date,
    last_synced_at,
    error_message,
    cancellation_requested_at
  ),
  delhivery_reverse_pickups:delhivery_reverse_pickups(
    id,
    order_item_id,
    pickup_type,
    awb,
    exchange_forward_awb,
    status,
    last_synced_at,
    error_message
  )
`

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

async function getRtoOrderIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('delhivery_shipments')
    .select('order_id, status, status_type, instructions, status_code')
    .or(
      'status_type.eq.RT,status.ilike.%rto%,instructions.ilike.%rto%,status_code.ilike.%RTO%'
    )

  if (error) throw error

  return [
    ...new Set(
      (data || [])
        .filter((row) =>
          isDelhiveryRtoStatus(
            row.status || '',
            row.status_type,
            row.instructions,
            row.status_code
          )
        )
        .map((row) => row.order_id)
        .filter(Boolean)
    ),
  ]
}

async function resolveSearchOrderIds(
  supabase: SupabaseClient,
  q: string
): Promise<string[]> {
  const term = escapeIlike(q)
  const ids = new Set<string>()

  const { data: byNumber, error: numberError } = await supabase
    .from('orders')
    .select('id')
    .ilike('order_number', `%${term}%`)

  if (numberError) throw numberError
  for (const row of byNumber || []) {
    if (row.id) ids.add(row.id)
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)

  if (usersError) throw usersError

  const userIds = (users || []).map((user) => user.id).filter(Boolean)
  if (userIds.length > 0) {
    const { data: byUser, error: userOrdersError } = await supabase
      .from('orders')
      .select('id')
      .in('user_id', userIds)

    if (userOrdersError) throw userOrdersError
    for (const row of byUser || []) {
      if (row.id) ids.add(row.id)
    }
  }

  return [...ids]
}

type FilterContext = {
  searchIds: string[] | null
  rtoOrderIds: string[] | null
}

async function buildFilterContext(
  supabase: SupabaseClient,
  query: AdminOrdersQuery
): Promise<FilterContext> {
  const searchIds = query.q ? await resolveSearchOrderIds(supabase, query.q) : null
  const rtoOrderIds =
    query.status === 'rto' ? await getRtoOrderIds(supabase) : null

  return { searchIds, rtoOrderIds }
}

function applyOrderFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbQuery: any,
  query: AdminOrdersQuery,
  filters: FilterContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let next = dbQuery

  if (filters.searchIds) {
    if (filters.searchIds.length === 0) {
      return next.in('id', [EMPTY_ID])
    }
    next = next.in('id', filters.searchIds)
  }

  if (query.status === 'rto') {
    const ids = filters.rtoOrderIds || []
    if (ids.length === 0) {
      return next.in('id', [EMPTY_ID])
    }
    next = next.in('id', ids)
  } else if (query.status !== 'all') {
    next = next.eq('status', query.status)
  }

  return next.order('created_at', { ascending: false })
}

function mapOrderRows(
  data: Array<Record<string, unknown>>,
  reasonById: Map<string, string>
) {
  const stuckOrderIds = data
    .filter((order) => {
      const items = (order.items as Array<{ status?: string }>) || []
      if (!areAllOrderItemsCancelled(items)) return false
      return !['cancelled', 'refunded'].includes(String(order.status || ''))
    })
    .map((order) => String(order.id))

  const stuckIdSet = new Set(stuckOrderIds)
  const healedAt = new Date().toISOString()

  return data.map((order) => ({
    ...order,
    status: stuckIdSet.has(String(order.id)) ? 'cancelled' : order.status,
    cancelled_at: stuckIdSet.has(String(order.id))
      ? order.cancelled_at || healedAt
      : order.cancelled_at,
    items: ((order.items as Array<Record<string, unknown>>) || []).map(
      (item) => ({
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
              label: reasonById.get(String(item.return_reason_id)),
            }
          : null,
      })
    ),
  }))
}

export async function getAdminOrdersPage(query: AdminOrdersQuery): Promise<{
  orders: ReturnType<typeof mapOrderRows>
  totalCount: number
  totalOrders: number
  page: number
  totalPages: number
  query: AdminOrdersQuery
}> {
  const supabase = await createClient()
  const pageSize = ADMIN_ORDERS_PAGE_SIZE

  const [{ count: totalOrders }, { data: returnReasons }] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('return_reasons').select('id, label'),
  ])

  const reasonById = new Map(
    (returnReasons || []).map((reason) => [reason.id, reason.label])
  )

  const filters = await buildFilterContext(supabase, query)

  const runPage = async (page: number) => {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const dbQuery = applyOrderFilters(
      supabase.from('orders').select(ORDER_SELECT, { count: 'exact' }),
      query,
      filters
    )
    return dbQuery.range(from, to)
  }

  let page = query.page
  let { data, error, count } = await runPage(page)
  if (error) throw error

  const totalCount = count || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  if (page > totalPages && totalCount > 0) {
    page = totalPages
    const retry = await runPage(page)
    if (retry.error) throw retry.error
    data = retry.data
    count = retry.count
  }

  const rows = mapOrderRows((data || []) as Array<Record<string, unknown>>, reasonById)

  const stuckOrderIds = rows
    .filter((order) => {
      const items = order.items || []
      if (!areAllOrderItemsCancelled(items)) return false
      return !['cancelled', 'refunded'].includes(String(order.status || ''))
    })
    .map((order) => String(order.id))

  if (stuckOrderIds.length > 0) {
    const healedAt = new Date().toISOString()
    const { error: healError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: healedAt,
      })
      .in('id', stuckOrderIds)

    if (healError) {
      logger.warn('Failed to heal cancelled order statuses', {
        healError,
        stuckOrderIds,
      })
    }
  }

  return {
    orders: rows,
    totalCount: count || totalCount,
    totalOrders: totalOrders || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || totalCount) / pageSize)),
    query: { ...query, page },
  }
}
