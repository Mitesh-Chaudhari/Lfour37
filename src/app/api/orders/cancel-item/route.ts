import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelDelhiveryShipmentForOrder } from '@/lib/delhivery-shipping'
import { processItemRefund } from '@/lib/refunds'
import { notifyOrderCancelled } from '@/lib/whatsapp/order-notifications'
import { sendOrderStatusEmail } from '@/lib/email'
import logger from '@/lib/logger'
import {
  areAllOrderItemsCancelled,
  canCancelOrderItem,
  isItemCancelled,
} from '@/lib/order-status'

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
    .select('id, order_id, variant_id, quantity, status, return_status')
    .eq('id', order_item_id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  if (isItemCancelled(item.status)) {
    return NextResponse.json(
      { error: 'This item is already cancelled' },
      { status: 400 }
    )
  }

  const { data: order } = await supabase
    .from('orders')
    .select('status, user_id, payment_method, payment_status')
    .eq('id', item.order_id)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!canCancelOrderItem(item, order)) {
    return NextResponse.json(
      { error: 'This item cannot be cancelled after shipment' },
      { status: 400 }
    )
  }

  const { data: updated, error } = await supabase
    .from('order_items')
    .update({
      status: 'cancelled',
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

  if (item.variant_id) {
    const { error: stockError } = await supabase.rpc('restore_variant_stock', {
      variant_uuid: item.variant_id,
      qty: item.quantity,
    })

    if (stockError) {
      logger.error('Failed to restore stock after item cancellation', {
        stockError,
        orderItemId: order_item_id,
      })
    }
  }

  const { data: siblings } = await supabase
    .from('order_items')
    .select('status')
    .eq('order_id', item.order_id)

  const allCancelled = areAllOrderItemsCancelled(siblings || [])

  if (allCancelled) {
    const delhiveryCancel = await cancelDelhiveryShipmentForOrder(item.order_id)
    if (!delhiveryCancel.ok && !delhiveryCancel.skipped) {
      return NextResponse.json(
        {
          error:
            delhiveryCancel.error ||
            'Could not cancel the Delhivery shipment for this order',
        },
        { status: 409 }
      )
    }

    await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', item.order_id)
  }

  let refund = null
  let refundError: string | null = null

  if (
    order.payment_status === 'completed' &&
    order.payment_method !== 'cod'
  ) {
    try {
      refund = await processItemRefund(order_item_id)
    } catch (error) {
      refundError = error instanceof Error ? error.message : 'Refund failed'
      logger.error('Cancellation refund failed', {
        error,
        orderId: item.order_id,
        orderItemId: order_item_id,
      })
    }
  }

  const { data: orderDetails } = await supabase
    .from('orders')
    .select('*, user:users(email), items:order_items(*)')
    .eq('id', item.order_id)
    .single()

  const { data: cancelledItem } = await supabase
    .from('order_items')
    .select('product_name, quantity, variant_size, variant_color')
    .eq('id', order_item_id)
    .single()

  const orderUser = Array.isArray(orderDetails?.user)
    ? orderDetails?.user[0]
    : orderDetails?.user

  if (allCancelled && orderUser?.email && orderDetails) {
    sendOrderStatusEmail(orderDetails, orderUser.email, 'cancelled').catch(
      (err) =>
        logger.error('Cancel email failed', { err, orderId: item.order_id })
    )
  }

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

  return NextResponse.json({
    success: true,
    refund,
    refund_error: refundError,
    all_items_cancelled: allCancelled,
  })
}
