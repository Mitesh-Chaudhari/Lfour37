import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncDelhiveryShipmentByOrderId } from '@/lib/delhivery-shipping'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const summary = await syncDelhiveryShipmentByOrderId(id)
    return NextResponse.json({
      tracking: summary.tracking,
      orderStatus: summary.orderStatus,
      carrierStatus: summary.carrierStatus,
    })
  } catch (error) {
    logger.warn('Customer tracking refresh failed', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tracking refresh failed' },
      { status: 404 }
    )
  }
}
