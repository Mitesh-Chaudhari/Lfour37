import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createDelhiveryShipmentForOrder,
  syncDelhiveryShipmentByOrderId,
} from '@/lib/delhivery-shipping'
import { createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
  action: z.enum(['create', 'sync']).default('create'),
})

async function getOrderShipmentSnapshot(orderId: string) {
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('status, tracking_number, shipped_at, delivered_at')
    .eq('id', orderId)
    .single()

  const { data: shipment } = await admin
    .from('delhivery_shipments')
    .select(
      'id, awb, status, last_synced_at, expected_delivery_date, error_message'
    )
    .eq('order_id', orderId)
    .maybeSingle()

  return { order, shipment }
}

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
      const summary = await syncDelhiveryShipmentByOrderId(parsed.data.order_id)
      const snapshot = await getOrderShipmentSnapshot(parsed.data.order_id)

      return NextResponse.json({
        success: true,
        tracking: summary.tracking,
        order: snapshot.order,
        shipment: snapshot.shipment,
        orderStatus: summary.orderStatus,
        carrierStatus: summary.carrierStatus,
      })
    }

    const shipment = await createDelhiveryShipmentForOrder(parsed.data.order_id)
    const snapshot = await getOrderShipmentSnapshot(parsed.data.order_id)

    return NextResponse.json({
      success: true,
      shipment,
      order: snapshot.order,
      delhivery_shipment: snapshot.shipment,
      orderStatus: snapshot.order?.status,
      carrierStatus: snapshot.shipment?.status,
    })
  } catch (error) {
    logger.error('Admin Delhivery shipment action failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Shipment action failed' },
      { status: 500 }
    )
  }
}
