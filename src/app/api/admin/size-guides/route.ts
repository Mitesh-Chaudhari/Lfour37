import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const createGuideSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullable().optional(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  category_ids: z.array(z.string().uuid()).optional(),
})

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return null
  }

  return user
}

async function syncCategoryMappings(guideId: string, categoryIds: string[]) {
  const admin = createAdminClient()

  await admin.from('category_size_guides').delete().eq('size_guide_id', guideId)

  if (categoryIds.length) {
    await admin.from('category_size_guides').insert(
      categoryIds.map((categoryId) => ({
        category_id: categoryId,
        size_guide_id: guideId,
      }))
    )
  }
}

export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: guides, error } = await admin
    .from('size_guides')
    .select('*, rows:size_guide_rows(*)')
    .order('display_order')
    .order('title')

  if (error) {
    logger.error('Failed to list size guides', { error })
    return NextResponse.json({ error: 'Failed to load size guides' }, { status: 500 })
  }

  return NextResponse.json(guides || [])
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = createGuideSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { title, subtitle, display_order, is_active, category_ids } = parsed.data
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('size_guides')
      .insert({
        title,
        subtitle: subtitle || null,
        display_order: display_order ?? 0,
        is_active: is_active ?? true,
      })
      .select('id')
      .single()

    if (error || !data) {
      logger.error('Failed to create size guide', { error })
      return NextResponse.json({ error: 'Failed to create size guide' }, { status: 500 })
    }

    if (category_ids?.length) {
      await syncCategoryMappings(data.id, category_ids)
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (error) {
    logger.error('Create size guide route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
