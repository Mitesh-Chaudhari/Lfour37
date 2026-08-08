import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { areAllOrderItemsCancelled } from '@/lib/order-status'
import logger from '@/lib/logger'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { item_id } = await req.json()

  if (!item_id) {
    return NextResponse.json({ error: 'Missing item_id' }, { status: 400 })
  }

  // Get item
  const { data: item } = await supabase
    .from('order_items')
    .select('id, order_id, variant_id, quantity, status')
    .eq('id', item_id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  // Prevent double approval
  if (item.status === 'cancelled') {
    return NextResponse.json({ success: true })
  }

  // Update status
  const { error } = await supabase
    .from('order_items')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', item_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Restore stock
  if (item.variant_id) {
    await supabase.rpc('restore_variant_stock', {
      variant_uuid: item.variant_id,
      qty: item.quantity,
    })
  }

  const { data: siblings } = await supabase
    .from('order_items')
    .select('status')
    .eq('order_id', item.order_id)

  const allCancelled = areAllOrderItemsCancelled(siblings || [])
  if (allCancelled) {
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', item.order_id)

    if (orderError) {
      logger.error('Legacy cancel-approve failed to mark order cancelled', {
        orderError,
        orderId: item.order_id,
      })
    }
  }

  return NextResponse.json({
    success: true,
    all_items_cancelled: allCancelled,
  })
}
