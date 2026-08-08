import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cancelDelhiveryShipmentForOrder, type DelhiveryCancelResult } from '@/lib/delhivery-shipping'
import { processItemRefund } from '@/lib/refunds'
import {
  sendOrderStatusEmail,
  sendOrderCancelledOwnerNotificationEmail,
} from '@/lib/email'
import { notifyOrderCancelled } from '@/lib/whatsapp/order-notifications'
import logger from '@/lib/logger'
import { areAllOrderItemsCancelled } from '@/lib/order-status'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
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

    const { item_id } = await req.json()
    if (!item_id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }

    const { data: item, error: itemError } = await admin
      .from('order_items')
      .select('id, order_id, variant_id, quantity, status')
      .eq('id', item_id)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.status !== 'cancel_requested') {
      return NextResponse.json(
        { error: 'Only cancellation requests can be approved' },
        { status: 400 }
      )
    }

    const { data: updatedItem, error: updateError } = await admin
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', item_id)
      .select('id, status')
      .single()

    if (updateError || !updatedItem) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to cancel item' },
        { status: 500 }
      )
    }

    if (item.variant_id) {
      const { error: stockError } = await admin.rpc('restore_variant_stock', {
        variant_uuid: item.variant_id,
        qty: item.quantity,
      })

      if (stockError) {
        logger.error('Failed to restore stock after cancel approval', {
          stockError,
          item_id,
        })
      }
    }

    const { data: siblings } = await admin
      .from('order_items')
      .select('status')
      .eq('order_id', item.order_id)

    const allCancelled = areAllOrderItemsCancelled(siblings || [])
    let delhiveryCancel: DelhiveryCancelResult = { ok: true, skipped: true }

    if (allCancelled) {
      // Always mark the order cancelled when every item is cancelled.
      // Carrier cancel is best-effort and must not leave status stuck on processing.
      await admin
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', item.order_id)

      delhiveryCancel = await cancelDelhiveryShipmentForOrder(item.order_id)
      if (!delhiveryCancel.ok && !delhiveryCancel.skipped) {
        logger.warn('Cancel approved but Delhivery cancel failed', {
          orderId: item.order_id,
          error: delhiveryCancel.error,
        })
      }
    }

    const { data: order } = await admin
      .from('orders')
      .select('payment_method, payment_status')
      .eq('id', item.order_id)
      .single()

    let refund = null
    if (order?.payment_status === 'completed') {
      try {
        refund = await processItemRefund(item_id)
      } catch (refundError) {
        logger.error('Cancellation approved but refund failed', {
          refundError,
          item_id,
        })
        return NextResponse.json({
          success: true,
          cancelled: true,
          delhivery: delhiveryCancel,
          refund_error:
            refundError instanceof Error
              ? refundError.message
              : 'Refund failed',
        })
      }
    }

    const { data: fullOrder } = await admin
      .from('orders')
      .select('*, user:users(email), items:order_items(*)')
      .eq('id', item.order_id)
      .single()

    if (fullOrder) {
      const orderUser = Array.isArray(fullOrder.user)
        ? fullOrder.user[0]
        : fullOrder.user
      const cancelledItem =
        fullOrder.items?.find((orderItem: { id: string }) => orderItem.id === item_id) ||
        fullOrder.items?.[0]

      sendOrderCancelledOwnerNotificationEmail(fullOrder, {
        customerEmail: orderUser?.email || null,
        cancelledItem,
        entireOrderCancelled: allCancelled,
        cancelledBy: 'admin',
      }).catch((error) =>
        logger.error('Owner cancel notification failed', {
          error,
          orderId: item.order_id,
        })
      )

      if (allCancelled) {
        if (orderUser?.email) {
          sendOrderStatusEmail(fullOrder, orderUser.email, 'cancelled').catch(
            (error) =>
              logger.error('Cancel approve email failed', {
                error,
                orderId: item.order_id,
              })
          )
        }

        notifyOrderCancelled({
          order: {
            id: fullOrder.id,
            order_number: fullOrder.order_number,
            user_id: fullOrder.user_id,
            shipping_address: fullOrder.shipping_address,
          },
          item: cancelledItem,
        }).catch((error) =>
          logger.error('Cancel approve WhatsApp failed', {
            error,
            orderId: item.order_id,
          })
        )
      }
    }

    return NextResponse.json({
      success: true,
      cancelled: true,
      delhivery: delhiveryCancel,
      refund,
      all_items_cancelled: allCancelled,
    })
  } catch (error) {
    logger.error('Cancel approve failed', { error })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
