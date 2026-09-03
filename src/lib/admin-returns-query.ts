import { createClient } from '@/lib/supabase/server'
import {
  ADMIN_RETURNS_PAGE_SIZE,
  type AdminReturnsQuery,
} from '@/lib/admin-returns'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const EMPTY_ID = '00000000-0000-0000-0000-000000000000'

const ITEM_SELECT = `
  id,
  order_id,
  product_name,
  product_image,
  quantity,
  unit_price,
  total_price,
  variant_size,
  variant_color,
  exchange_size,
  exchange_color,
  status,
  return_status,
  return_type,
  return_custom_reason,
  return_reason_id,
  return_requested_at,
  seal_tag_image_url,
  product_front_image_url,
  product_back_image_url,
  refund_method,
  refund_status,
  refunded_amount,
  bank_account,
  order:orders(
    id,
    order_number,
    created_at,
    payment_method,
    payment_status,
    status,
    shipping_address,
    user:users(
      full_name,
      email,
      phone
    )
  )
`

export type AdminReturnItem = {
  id: string
  order_id: string
  product_name: string
  product_image?: string | null
  quantity: number
  unit_price: number
  total_price: number
  variant_size?: string | null
  variant_color?: string | null
  exchange_size?: string | null
  exchange_color?: string | null
  status?: string | null
  return_status?: string | null
  return_type?: string | null
  return_custom_reason?: string | null
  return_reason_id?: string | null
  return_requested_at?: string | null
  seal_tag_image_url?: string | null
  product_front_image_url?: string | null
  product_back_image_url?: string | null
  refund_method?: string | null
  refund_status?: string | null
  refunded_amount?: number | null
  bank_account?: {
    account_holder_name?: string | null
    bank_name?: string | null
    account_number?: string | null
    ifsc?: string | null
  } | null
  return_reason?: { id?: string; label?: string } | null
  reverse_pickup?: {
    awb?: string | null
    exchange_forward_awb?: string | null
    status?: string | null
    error_message?: string | null
  } | null
  order?: {
    id: string
    order_number: string
    created_at: string
    payment_method?: string | null
    payment_status?: string | null
    status?: string | null
    shipping_address?: {
      full_name?: string | null
      phone?: string | null
      city?: string | null
      state?: string | null
      postal_code?: string | null
    } | null
    user?: {
      full_name?: string | null
      email?: string | null
      phone?: string | null
    } | null
  } | null
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

async function resolveSearchItemIds(
  supabase: SupabaseClient,
  q: string
): Promise<string[]> {
  const term = escapeIlike(q)
  const ids = new Set<string>()

  const { data: byProduct, error: productError } = await supabase
    .from('order_items')
    .select('id')
    .not('return_status', 'is', null)
    .ilike('product_name', `%${term}%`)

  if (productError) throw productError
  for (const row of byProduct || []) ids.add(row.id)

  const { data: orders, error: orderError } = await supabase
    .from('orders')
    .select('id')
    .ilike('order_number', `%${term}%`)

  if (orderError) throw orderError
  const orderIds = (orders || []).map((row) => row.id).filter(Boolean)

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)

  if (usersError) throw usersError
  const userIds = (users || []).map((row) => row.id).filter(Boolean)

  if (userIds.length > 0) {
    const { data: userOrders, error: userOrdersError } = await supabase
      .from('orders')
      .select('id')
      .in('user_id', userIds)

    if (userOrdersError) throw userOrdersError
    for (const row of userOrders || []) {
      if (row.id) orderIds.push(row.id)
    }
  }

  if (orderIds.length > 0) {
    const { data: byOrder, error: byOrderError } = await supabase
      .from('order_items')
      .select('id')
      .not('return_status', 'is', null)
      .in('order_id', [...new Set(orderIds)])

    if (byOrderError) throw byOrderError
    for (const row of byOrder || []) ids.add(row.id)
  }

  return [...ids]
}

function applyReturnFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbQuery: any,
  query: AdminReturnsQuery,
  searchIds: string[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let next = dbQuery.not('return_status', 'is', null)

  if (searchIds) {
    next = next.in('id', searchIds.length ? searchIds : [EMPTY_ID])
  }

  if (query.status === 'requested') {
    next = next.eq('return_status', 'return_requested')
  } else if (query.status === 'approved') {
    next = next.eq('return_status', 'return_approved')
  } else if (query.status === 'rejected') {
    next = next.eq('return_status', 'return_rejected')
  }

  if (query.type !== 'all') {
    next = next.eq('return_type', query.type)
  }

  return next.order('return_requested_at', {
    ascending: false,
    nullsFirst: false,
  })
}

export async function getAdminReturnsPage(query: AdminReturnsQuery): Promise<{
  items: AdminReturnItem[]
  totalCount: number
  pendingCount: number
  page: number
  totalPages: number
  query: AdminReturnsQuery
}> {
  const supabase = await createClient()
  const pageSize = ADMIN_RETURNS_PAGE_SIZE

  const [{ count: pendingCount }, { data: returnReasons }] = await Promise.all([
    supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('return_status', 'return_requested'),
    supabase.from('return_reasons').select('id, label'),
  ])

  const reasonById = new Map(
    (returnReasons || []).map((reason) => [reason.id, reason.label])
  )

  const searchIds = query.q ? await resolveSearchItemIds(supabase, query.q) : null

  const runPage = async (page: number) => {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    return applyReturnFilters(
      supabase.from('order_items').select(ITEM_SELECT, { count: 'exact' }),
      query,
      searchIds
    ).range(from, to)
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

  const rows = (data || []) as AdminReturnItem[]
  const itemIds = rows.map((row) => row.id)

  const pickupsByItem = new Map<
    string,
    AdminReturnItem['reverse_pickup']
  >()

  if (itemIds.length > 0) {
    const { data: pickups } = await supabase
      .from('delhivery_reverse_pickups')
      .select(
        'order_item_id, awb, exchange_forward_awb, status, error_message'
      )
      .in('order_item_id', itemIds)

    for (const pickup of pickups || []) {
      pickupsByItem.set(pickup.order_item_id, {
        awb: pickup.awb,
        exchange_forward_awb: pickup.exchange_forward_awb,
        status: pickup.status,
        error_message: pickup.error_message,
      })
    }
  }

  const items = rows.map((row) => {
    const order = asSingle(row.order)
    const user = asSingle(order?.user)

    return {
      ...row,
      order: order
        ? {
            ...order,
            user,
          }
        : null,
      return_reason: row.return_reason_id
        ? {
            id: row.return_reason_id,
            label: reasonById.get(row.return_reason_id),
          }
        : null,
      reverse_pickup: pickupsByItem.get(row.id) || null,
    }
  })

  return {
    items,
    totalCount: count || totalCount,
    pendingCount: pendingCount || 0,
    page,
    totalPages: Math.max(1, Math.ceil((count || totalCount) / pageSize)),
    query: { ...query, page },
  }
}
