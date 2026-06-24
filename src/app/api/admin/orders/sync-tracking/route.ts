import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncDelhiveryShipmentsForAdmin } from '@/lib/delhivery-shipping'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_ids: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const results = await syncDelhiveryShipmentsForAdmin({
      orderIds: parsed.data.order_ids,
      limit: parsed.data.limit,
    })

    return NextResponse.json({
      success: true,
      synced: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    })
  } catch (error) {
    logger.error('Admin Delhivery tracking sync failed', { error })
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Tracking sync failed',
      },
      { status: 500 }
    )
  }
}
