import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendOrderStatusEmail } from '@/lib/email'
import {
  notifyOrderCancelled,
  notifyOrderDelivered,
  notifyOrderShipped,
} from '@/lib/whatsapp/order-notifications'
import logger from '@/lib/logger'
import { OrderStatus } from '@/types'

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { order_id, status, tracking_number } = await req.json()
    if (!order_id || !status) return NextResponse.json({ error: 'order_id and status required' }, { status: 400 })

    const validStatuses: OrderStatus[] = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = { status }
    if (tracking_number) updatePayload.tracking_number = tracking_number
    if (status === 'shipped') updatePayload.shipped_at = new Date().toISOString()
    if (status === 'delivered') updatePayload.delivered_at = new Date().toISOString()
    if (status === 'cancelled') updatePayload.cancelled_at = new Date().toISOString()

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order_id)
      .select('*, user:users(email, full_name), items:order_items(*)')
      .single()

    if (error) {
      logger.error('Order status update error', { error, order_id })
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
    }

    // Send status email
    try {
      const orderUser = Array.isArray(updatedOrder.user) ? updatedOrder.user[0] : updatedOrder.user
      if (orderUser?.email) {
        await sendOrderStatusEmail(
          updatedOrder as any,
          orderUser.email,
          status
        )
      }
    } catch (emailError) {
      logger.warn('Failed to send status email', { emailError, order_id })
    }

    try {
      const orderForWhatsApp = {
        id: updatedOrder.id,
        order_number: updatedOrder.order_number,
        user_id: updatedOrder.user_id,
        shipping_address: updatedOrder.shipping_address,
        tracking_number: updatedOrder.tracking_number,
      }

      if (status === 'shipped') {
        await notifyOrderShipped(
          orderForWhatsApp,
          tracking_number || updatedOrder.tracking_number
        )
      } else if (status === 'delivered') {
        await notifyOrderDelivered(orderForWhatsApp)
      } else if (status === 'cancelled') {
        const firstItem = Array.isArray(updatedOrder.items)
          ? updatedOrder.items[0]
          : null

        await notifyOrderCancelled({
          order: orderForWhatsApp,
          item: firstItem
            ? {
                product_name: firstItem.product_name,
                variant_size: firstItem.variant_size,
                variant_color: firstItem.variant_color,
                quantity: firstItem.quantity,
              }
            : null,
        })
      }
    } catch (whatsappError) {
      logger.warn('Failed to send status WhatsApp', { whatsappError, order_id })
    }

    logger.info('Order status updated', { order_id, status, updated_by: user.id })

    return NextResponse.json({ success: true, order: updatedOrder })
  } catch (error) {
    logger.error('Status update error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
