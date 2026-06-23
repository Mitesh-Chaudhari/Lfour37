import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const updateGuideSchema = z.object({
  title: z.string().min(1).max(200).optional(),
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

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const admin = createAdminClient()

  const [{ data: guide, error }, { data: mappings }] = await Promise.all([
    admin
      .from('size_guides')
      .select('*, rows:size_guide_rows(*)')
      .eq('id', id)
      .single(),
    admin.from('category_size_guides').select('category_id').eq('size_guide_id', id),
  ])

  if (error || !guide) {
    return NextResponse.json({ error: 'Size guide not found' }, { status: 404 })
  }

  const rows = [...(guide.rows || [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  )

  return NextResponse.json({
    ...guide,
    rows,
    category_ids: (mappings || []).map((item) => item.category_id),
  })
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const parsed = updateGuideSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { category_ids, ...updates } = parsed.data
    const admin = createAdminClient()

    if (Object.keys(updates).length) {
      const { error } = await admin.from('size_guides').update(updates).eq('id', id)
      if (error) {
        logger.error('Failed to update size guide', { error, id })
        return NextResponse.json({ error: 'Failed to update size guide' }, { status: 500 })
      }
    }

    if (category_ids) {
      await admin.from('category_size_guides').delete().eq('size_guide_id', id)
      if (category_ids.length) {
        await admin.from('category_size_guides').insert(
          category_ids.map((categoryId) => ({
            category_id: categoryId,
            size_guide_id: id,
          }))
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Update size guide route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const admin = createAdminClient()
    const { error } = await admin.from('size_guides').delete().eq('id', id)

    if (error) {
      logger.error('Failed to delete size guide', { error, id })
      return NextResponse.json({ error: 'Failed to delete size guide' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Delete size guide route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
