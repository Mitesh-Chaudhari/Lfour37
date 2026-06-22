import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createDelhiveryShipmentForOrder,
  syncDelhiveryShipmentByOrderId,
} from '@/lib/delhivery-shipping'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
  action: z.enum(['create', 'sync']).default('create'),
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

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    if (parsed.data.action === 'sync') {
      const tracking = await syncDelhiveryShipmentByOrderId(parsed.data.order_id)
      return NextResponse.json({ success: true, tracking })
    }

    const shipment = await createDelhiveryShipmentForOrder(parsed.data.order_id)
    return NextResponse.json({ success: true, shipment })
  } catch (error) {
    logger.error('Admin Delhivery shipment action failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Shipment action failed' },
      { status: 500 }
    )
  }
}
