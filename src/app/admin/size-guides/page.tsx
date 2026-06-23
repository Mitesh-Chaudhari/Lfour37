import { createClient } from '@/lib/supabase/server'
import { SizeGuidesClient } from '@/components/admin/size-guides-client'
import type { SizeGuide, SizeGuideRow } from '@/lib/size-guides'

export default async function AdminSizeGuidesPage() {
  const supabase = await createClient()

  const { data: guides } = await supabase
    .from('size_guides')
    .select('*, rows:size_guide_rows(*)')
    .order('display_order')
    .order('title')

  const normalizedGuides = (guides || []).map((guide) => ({
    ...(guide as SizeGuide),
    rows: [...((guide.rows || []) as SizeGuideRow[])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    ),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Size Guides</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create and manage size charts for topwear, bottomwear, and more.
        </p>
      </div>

      <SizeGuidesClient guides={normalizedGuides} />
    </div>
  )
}
