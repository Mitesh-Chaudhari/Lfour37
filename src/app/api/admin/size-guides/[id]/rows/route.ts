import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const rowSchema = z.object({
  size_label: z.string().min(1).max(20),
  chest: z.string().max(50),
  shoulder: z.string().max(50),
  length: z.string().max(50),
  ideal_fit: z.string().max(100),
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
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const parsed = rowSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('size_guide_rows')
      .insert({
        size_guide_id: id,
        ...parsed.data,
        display_order: parsed.data.display_order ?? 0,
      })
      .select('*')
      .single()

    if (error) {
      logger.error('Failed to create size guide row', { error, id })
      return NextResponse.json({ error: 'Failed to create row' }, { status: 500 })
    }

    return NextResponse.json({ success: true, row: data })
  } catch (error) {
    logger.error('Create size guide row route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
