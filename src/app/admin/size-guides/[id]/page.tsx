import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SizeGuideEditor } from '@/components/admin/size-guide-editor'
import type { SizeGuide, SizeGuideRow } from '@/lib/size-guides'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminSizeGuideDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: guide }, { data: mappings }, { data: categories }] = await Promise.all([
    supabase
      .from('size_guides')
      .select('*, rows:size_guide_rows(*)')
      .eq('id', id)
      .single(),
    supabase.from('category_size_guides').select('category_id').eq('size_guide_id', id),
    supabase.from('categories').select('id, name').eq('is_active', true).order('name'),
  ])

  if (!guide) notFound()

  const normalizedGuide: SizeGuide = {
    ...(guide as SizeGuide),
    rows: [...((guide.rows || []) as SizeGuideRow[])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    ),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Size Guide</h1>
        <p className="mt-1 text-sm text-gray-500">{guide.title}</p>
      </div>

      <SizeGuideEditor
        guide={normalizedGuide}
        categories={categories || []}
        categoryIds={(mappings || []).map((item) => item.category_id)}
      />
    </div>
  )
}
