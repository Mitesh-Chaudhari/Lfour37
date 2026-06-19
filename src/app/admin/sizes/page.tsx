import { SizesClient } from '@/components/admin/sizes-client'
import { createClient } from '@/lib/supabase/server'

export default async function AdminSizesPage() {
  const supabase = await createClient()

  const [{ data: sizes }, { data: variants }] = await Promise.all([
    supabase
      .from('product_sizes')
      .select('id, name, display_order, created_at')
      .order('display_order')
      .order('name'),
    supabase
      .from('product_variants')
      .select('size'),
  ])

  const usageByName = (variants || []).reduce<Record<string, number>>(
    (counts, variant) => {
      counts[variant.size] = (counts[variant.size] || 0) + 1
      return counts
    },
    {}
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Sizes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage the sizes available when creating product variants.
        </p>
      </div>

      <SizesClient sizes={sizes || []} usageByName={usageByName} />
    </div>
  )
}
