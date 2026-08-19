import { Suspense } from 'react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { AdminOrdersTable } from '@/components/admin/orders-table'
import { areAllOrderItemsCancelled } from '@/lib/order-status'
import { cancelExpiredUnpaidOrders } from '@/lib/cancel-unpaid-orders'
import logger from '@/lib/logger'

async function getOrders() {
  const supabase = await createClient()

  // Keep admin list in sync even if Vercel cron is delayed/unavailable.
  try {
    await cancelExpiredUnpaidOrders(createAdminClient(), { limit: 100 })
  } catch (error) {
    logger.warn('Failed to auto-cancel unpaid pending orders on admin load', {
      error,
    })
  }

  const [{ data }, { data: returnReasons }] = await Promise.all([
    supabase
      .from('orders')
      .select(`
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
    `)
      .order('created_at', {
        ascending: false,
      }),
    supabase.from('return_reasons').select('id, label'),
  ])

  const reasonById = new Map(
    (returnReasons || []).map((reason) => [reason.id, reason.label])
  )

  // Heal rows where every item is cancelled but the order is still open
  // (e.g. older cancels blocked by Delhivery failures).
  const stuckOrderIds = (data || [])
    .filter((order) => {
      const items = order.items || []
      if (!areAllOrderItemsCancelled(items)) return false
      return !['cancelled', 'refunded'].includes(order.status || '')
    })
    .map((order) => order.id)

  const healedAt = new Date().toISOString()
  if (stuckOrderIds.length > 0) {
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

  const stuckIdSet = new Set(stuckOrderIds)

  return (data || []).map((order) => ({
    ...order,
    status: stuckIdSet.has(order.id) ? 'cancelled' : order.status,
    cancelled_at: stuckIdSet.has(order.id)
      ? order.cancelled_at || healedAt
      : order.cancelled_at,
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
          ? { id: item.return_reason_id, label: reasonById.get(item.return_reason_id) }
          : null,
      })
    ),
  }))
}

export default async function AdminOrdersPage() {
  const orders = await getOrders()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
        <p className="text-gray-500 mt-1">
          {orders.length} orders · Forward shipped/delivered, cancellations, and
          return/exchange pickups sync from Delhivery or DTDC
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-gray-400">Loading orders…</p>}>
        <AdminOrdersTable orders={orders} />
      </Suspense>
    </div>
  )
}
