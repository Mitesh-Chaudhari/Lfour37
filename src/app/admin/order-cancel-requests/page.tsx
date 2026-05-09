import { createClient } from '@/lib/supabase/server'
import CancelRequestActions from '@/components/admin/order-cancel-request-actions'
import Image from 'next/image'

export default async function CancelRequestsPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('order_items')
    .select(`
      *,
      order:orders(order_number, user_id)
    `)
    .eq('status', 'cancel_requested')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Cancel Requests</h1>

      {!items?.length && (
        <p className="text-gray-500">No cancel requests</p>
      )}

      {items?.map((item) => (
        <div key={item.id} className="border p-4 rounded-lg flex justify-between items-center">

          {/* LEFT */}
          <div className="flex gap-4 items-center">
            <div className="w-12 h-12 relative">
              {item.product_image && (
                <Image
                  src={item.product_image}
                  alt=""
                  fill
                  className="object-cover rounded"
                />
              )}
            </div>

            <div>
              <p className="font-medium">{item.product_name}</p>
              <p className="text-xs text-gray-500">
                {item.variant_size} / {item.variant_color}
              </p>
              <p className="text-xs text-red-500">
                Reason: {item.cancel_reason}
              </p>
            </div>
          </div>

          {/* RIGHT */}
          <CancelRequestActions itemId={item.id} />
        </div>
      ))}
    </div>
  )
}