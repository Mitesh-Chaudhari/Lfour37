import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ensureDelhiveryShipmentForPaidOrder } from '@/lib/delhivery-shipping'
import { sendOrderConfirmationEmail, sendNewOrderOwnerNotificationEmail } from '@/lib/email'
import { notifyOrderConfirmation } from '@/lib/whatsapp/order-notifications'
import { markAbandonedCartRecovered } from '@/lib/abandoned-cart'
import logger from '@/lib/logger'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
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

    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { order_id } = parsed.data

    const { data: order } = await supabase
      .from('orders')
      .select('*, items:order_items(*), user:users(email)')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.payment_method !== 'cod') {
      return NextResponse.json(
        { error: 'This order is not a Cash on Delivery order' },
        { status: 400 }
      )
    }

    const advance = Number(order.cod_advance_amount || 0)
    if (advance > 0) {
      const { data: prepaid } = await createAdminClient()
        .from('payments')
        .select('id, status')
        .eq('order_id', order_id)
        .eq('payment_method', 'razorpay')
        .eq('status', 'completed')
        .maybeSingle()

      if (!prepaid) {
        return NextResponse.json(
          { error: 'Pay the COD shipping charges online before placing this order' },
          { status: 400 }
        )
      }
    }

    // Already confirmed — only ensure shipment, do not re-send confirmation.
    if (order.status === 'processing' || order.status === 'paid') {
      const shipment = await ensureDelhiveryShipmentForPaidOrder(order_id)
      return NextResponse.json({ success: true, shipment })
    }

    if (order.payment_status === 'completed') {
      return NextResponse.json({ success: true })
    }

    const admin = createAdminClient()

    await admin
      .from('orders')
      .update({ status: 'processing', payment_status: 'pending' })
      .eq('id', order_id)

    const { data: existingPayment } = await admin
      .from('payments')
      .select('id')
      .eq('order_id', order_id)
      .maybeSingle()

    if (!existingPayment) {
      await admin.from('payments').insert({
        order_id,
        payment_method: 'cod',
        status: 'pending',
        amount: order.total,
        currency: 'INR',
      })
    }

    await admin.from('order_tracking').insert({
      order_id,
      status: 'placed',
      description: 'COD order placed successfully',
    })

    const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
    const confirmedOrder = {
      ...order,
      status: 'processing',
      payment_status: 'pending',
    }

    // 1) Confirmation first — must complete before Delhivery "pickup/shipped" messages.
    await Promise.all([
      sendNewOrderOwnerNotificationEmail(
        confirmedOrder as typeof order,
        orderUser?.email
      ).catch((error) =>
        logger.error('Owner new order notification failed', {
          error,
          orderId: order_id,
        })
      ),
      orderUser?.email
        ? sendOrderConfirmationEmail(confirmedOrder, orderUser.email).catch(
            (error) =>
              logger.error('COD order confirmation email failed', {
                error,
                orderId: order_id,
              })
          )
        : Promise.resolve(),
      notifyOrderConfirmation({
        id: order.id,
        order_number: order.order_number,
        total: order.total,
        created_at: order.created_at,
        user_id: order.user_id,
        shipping_address: order.shipping_address,
        items: order.items,
      }).catch((error) =>
        logger.error('COD order confirmation WhatsApp failed', {
          error,
          orderId: order_id,
        })
      ),
      markAbandonedCartRecovered(admin, user.id),
    ])

    // 2) Then create/sync Delhivery shipment (pickup/shipped messages happen later via sync).
    const shipment = await ensureDelhiveryShipmentForPaidOrder(order_id)

    return NextResponse.json({ success: true, shipment })
  } catch (error) {
    logger.error('COD confirmation failed', { error })
    return NextResponse.json({ error: 'Failed to place COD order' }, { status: 500 })
  }
}
