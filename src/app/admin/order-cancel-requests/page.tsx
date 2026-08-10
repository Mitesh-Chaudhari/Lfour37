import { createClient } from '@/lib/supabase/server'
import CancelRequestActions from '@/components/admin/order-cancel-request-actions'
import { OptimizedImage } from '@/components/ui/optimized-image'

function RequestPhoto({
  label,
  url,
}: {
  label: string
  url?: string | null
}) {
  if (!url) return null

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-500">{label}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="h-24 w-auto max-w-[120px] rounded-lg border object-cover"
        />
      </a>
    </div>
  )
}

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

      {items?.map((item) => {
        const hasPhotos =
          item.seal_tag_image_url ||
          item.product_front_image_url ||
          item.product_back_image_url

        return (
          <div
            key={item.id}
            className="border p-4 rounded-lg flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-start"
          >
            <div className="flex gap-4 items-start min-w-0">
              <div className="w-12 h-12 relative flex-shrink-0">
                {item.product_image && (
                  <OptimizedImage
                    src={item.product_image}
                    alt=""
                    fill
                    variant="adminThumb"
                    className="object-cover rounded"
                  />
                )}
              </div>

              <div className="min-w-0 space-y-2">
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-xs text-gray-500">
                    {item.variant_size} / {item.variant_color}
                  </p>
                  <p className="text-xs text-red-500">
                    Reason: {item.cancel_reason || item.cancel_custom_reason || '—'}
                  </p>
                </div>

                {hasPhotos && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    <RequestPhoto label="Seal tag" url={item.seal_tag_image_url} />
                    <RequestPhoto
                      label="Front"
                      url={item.product_front_image_url}
                    />
                    <RequestPhoto
                      label="Back"
                      url={item.product_back_image_url}
                    />
                  </div>
                )}
              </div>
            </div>

            <CancelRequestActions itemId={item.id} />
          </div>
        )
      })}
    </div>
  )
}
