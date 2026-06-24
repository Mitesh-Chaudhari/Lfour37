import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyOrderCancelled } from '@/lib/whatsapp/order-notifications'
import logger from '@/lib/logger'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { order_item_id, reason_id, custom_reason } = await req.json()

  if (!order_item_id || (!reason_id && !custom_reason)) {
    return NextResponse.json(
      { error: 'Reason required' },
      { status: 400 }
    )
  }

  const { data: item } = await supabase
    .from('order_items')
    .select('id, order_id')
    .eq('id', order_item_id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('status, user_id')
    .eq('id', item.order_id)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (['delivered', 'cancelled'].includes(order.status)) {
    return NextResponse.json(
      { error: 'Cannot cancel this order' },
      { status: 400 }
    )
  }

  const newStatus =
    ['shipped', 'out_for_delivery'].includes(order.status)
      ? 'cancel_requested'
      : 'cancelled'

  const { data: updated, error } = await supabase
    .from('order_items')
    .update({
      status: newStatus,
      cancel_reason_id: reason_id || null,
      cancel_custom_reason: custom_reason || null,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', order_item_id)
    .eq('order_id', item.order_id)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'Update blocked (RLS)' },
      { status: 403 }
    )
  }

  if (newStatus === 'cancelled' || newStatus === 'cancel_requested') {
    const { data: orderDetails } = await supabase
      .from('orders')
      .select('order_number, shipping_address')
      .eq('id', item.order_id)
      .single()

    const { data: cancelledItem } = await supabase
      .from('order_items')
      .select('product_name, quantity, variant_size, variant_color')
      .eq('id', order_item_id)
      .single()

    notifyOrderCancelled({
      order: {
        id: item.order_id,
        order_number: orderDetails?.order_number || '',
        user_id: user.id,
        shipping_address: orderDetails?.shipping_address,
      },
      item: cancelledItem,
    }).catch((err) =>
      logger.error('Cancel WhatsApp failed', { err, orderId: item.order_id })
    )
  }

  return NextResponse.json({ success: true })
}
