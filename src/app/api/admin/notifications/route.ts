import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Data for the admin sidebar notification dots:
 * - count of orders created after `orders_since`
 * - ids of order items currently awaiting cancel approval (the client
 *   tracks which ids it has already seen, since order_items has no
 *   "requested at" timestamp)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ordersSince = request.nextUrl.searchParams.get('orders_since')

  let newOrdersCount = 0
  if (ordersSince) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', ordersSince)
    newOrdersCount = count || 0
  }

  const { data: cancelRequests } = await supabase
    .from('order_items')
    .select('id')
    .eq('status', 'cancel_requested')
    .limit(200)

  return NextResponse.json({
    new_orders_count: newOrdersCount,
    cancel_request_ids: (cancelRequests || []).map((item) => item.id),
  })
}
