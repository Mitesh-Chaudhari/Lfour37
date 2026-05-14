import { createClient } from '@/lib/supabase/server'
import { AdminOrdersTable } from '@/components/admin/orders-table'

async function getOrders() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('orders')
    .select(`
      *,
      
      user:users(
        id,
        full_name,
        email
      ),

      items:order_items(
        id,
        status,
        return_status,
        return_type,
        refund_method,
        exchange_size,
        exchange_color,
        return_custom_reason,
        return_requested_at,

        product_name,
        quantity,
        total_price
      ),

      payment:payments(
        id,
        status,
        payment_method,
        stripe_payment_intent_id
      )
    `)
    .order('created_at', {
      ascending: false,
    })

  return data || []
}

export default async function AdminOrdersPage() {
  const orders = await getOrders()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
        <p className="text-gray-500 mt-1">{orders.length} orders</p>
      </div>
      <AdminOrdersTable orders={orders} />
    </div>
  )
}
