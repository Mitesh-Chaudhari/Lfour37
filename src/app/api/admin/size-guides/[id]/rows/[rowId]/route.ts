import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const rowSchema = z.object({
  size_label: z.string().min(1).max(20).optional(),
  chest: z.string().max(50).optional(),
  shoulder: z.string().max(50).optional(),
  length: z.string().max(50).optional(),
  ideal_fit: z.string().max(100).optional(),
  display_order: z.number().int().optional(),
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
  params: Promise<{ id: string; rowId: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, rowId } = await params
    const parsed = rowSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('size_guide_rows')
      .update(parsed.data)
      .eq('id', rowId)
      .eq('size_guide_id', id)
      .select('*')
      .single()

    if (error) {
      logger.error('Failed to update size guide row', { error, id, rowId })
      return NextResponse.json({ error: 'Failed to update row' }, { status: 500 })
    }

    return NextResponse.json({ success: true, row: data })
  } catch (error) {
    logger.error('Update size guide row route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, rowId } = await params
    const admin = createAdminClient()
    const { error } = await admin
      .from('size_guide_rows')
      .delete()
      .eq('id', rowId)
      .eq('size_guide_id', id)

    if (error) {
      logger.error('Failed to delete size guide row', { error, id, rowId })
      return NextResponse.json({ error: 'Failed to delete row' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Delete size guide row route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
