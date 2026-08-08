import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { AdminOrdersTable } from '@/components/admin/orders-table'

async function getOrders() {
  const supabase = await createClient()

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
        razorpay_payment_id,
        stripe_payment_intent_id,
        refunded_amount
      ),

      delhivery_shipment:delhivery_shipments(
        id,
        awb,
        status,
        status_code,
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

  return (data || []).map((order) => ({
    ...order,
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
          return/exchange pickups sync from Delhivery
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-gray-400">Loading orders…</p>}>
        <AdminOrdersTable orders={orders} />
      </Suspense>
    </div>
  )
}
