import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyOrderDelivered } from '@/lib/whatsapp/order-notifications'
import logger from '@/lib/logger'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { orderId } = await req.json()

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, shipping_address, user_id')
      .eq('id', orderId)
      .single()

    if (order) {
      notifyOrderDelivered(order).catch((err) =>
        logger.error('Delivered WhatsApp failed', { err, orderId })
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed' },
      { status: 500 }
    )
  }
}
