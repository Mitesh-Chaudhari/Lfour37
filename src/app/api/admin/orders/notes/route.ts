import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
  admin_notes: z.string().max(2000).nullable(),
})

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const trimmed =
      typeof parsed.data.admin_notes === 'string'
        ? parsed.data.admin_notes.trim()
        : ''
    const adminNotes = trimmed.length > 0 ? trimmed : null

    const { data, error } = await supabase
      .from('orders')
      .update({ admin_notes: adminNotes })
      .eq('id', parsed.data.order_id)
      .select('id, admin_notes')
      .single()

    if (error) {
      logger.error('Failed to update order admin notes', {
        error,
        orderId: parsed.data.order_id,
      })
      return NextResponse.json(
        { error: 'Failed to save note' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      order_id: data.id,
      admin_notes: data.admin_notes,
    })
  } catch (error) {
    logger.error('Admin order notes update failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
