import { createClient } from '@/lib/supabase/server'

export interface SizeGuideRow {
  id: string
  size_guide_id: string
  size_label: string
  chest: string
  shoulder: string
  length: string
  ideal_fit: string
  display_order: number
}

export interface SizeGuide {
  id: string
  title: string
  subtitle: string | null
  display_order: number
  is_active: boolean
  rows?: SizeGuideRow[]
  category_ids?: string[]
}

export async function getActiveSizeGuides(): Promise<SizeGuide[]> {
  const supabase = await createClient()

  const { data: guides } = await supabase
    .from('size_guides')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
    .order('title')

  if (!guides?.length) return []

  const guideIds = guides.map((guide) => guide.id)

  const { data: rows } = await supabase
    .from('size_guide_rows')
    .select('*')
    .in('size_guide_id', guideIds)
    .order('display_order')

  const rowsByGuide = (rows || []).reduce<Record<string, SizeGuideRow[]>>((acc, row) => {
    if (!acc[row.size_guide_id]) acc[row.size_guide_id] = []
    acc[row.size_guide_id].push(row as SizeGuideRow)
    return acc
  }, {})

  return guides.map((guide) => ({
    ...(guide as SizeGuide),
    rows: rowsByGuide[guide.id] || [],
  }))
}

export async function getSizeGuidesForCategories(
  categoryIds: string[]
): Promise<SizeGuide[]> {
  if (!categoryIds.length) {
    return getActiveSizeGuides()
  }

  const supabase = await createClient()

  const { data: mappings } = await supabase
    .from('category_size_guides')
    .select('size_guide_id')
    .in('category_id', categoryIds)

  const mappedGuideIds = [...new Set((mappings || []).map((item) => item.size_guide_id))]

  if (!mappedGuideIds.length) {
    return getActiveSizeGuides()
  }

  const { data: guides } = await supabase
    .from('size_guides')
    .select('*')
    .in('id', mappedGuideIds)
    .eq('is_active', true)
    .order('display_order')
    .order('title')

  if (!guides?.length) return []

  const { data: rows } = await supabase
    .from('size_guide_rows')
    .select('*')
    .in('size_guide_id', guides.map((guide) => guide.id))
    .order('display_order')

  const rowsByGuide = (rows || []).reduce<Record<string, SizeGuideRow[]>>((acc, row) => {
    if (!acc[row.size_guide_id]) acc[row.size_guide_id] = []
    acc[row.size_guide_id].push(row as SizeGuideRow)
    return acc
  }, {})

  return guides.map((guide) => ({
    ...(guide as SizeGuide),
    rows: rowsByGuide[guide.id] || [],
  }))
}
