import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureDelhiveryShipmentForPaidOrder } from '@/lib/delhivery-shipping'
import { sendOrderConfirmationEmail } from '@/lib/email'
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

    if (order.status === 'processing' || order.status === 'paid') {
      const shipment = await ensureDelhiveryShipmentForPaidOrder(order_id)
      return NextResponse.json({ success: true, shipment })
    }

    if (order.payment_status === 'completed') {
      return NextResponse.json({ success: true })
    }

    await supabase
      .from('orders')
      .update({ status: 'processing', payment_status: 'pending' })
      .eq('id', order_id)

    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('order_id', order_id)
      .maybeSingle()

    if (!existingPayment) {
      await supabase.from('payments').insert({
        order_id,
        payment_method: 'cod',
        status: 'pending',
        amount: order.total,
        currency: 'INR',
      })
    }

    await supabase.from('order_tracking').insert({
      order_id,
      status: 'placed',
      description: 'COD order placed successfully',
    })

    const shipment = await ensureDelhiveryShipmentForPaidOrder(order_id)

    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('tracking_number')
      .eq('id', order_id)
      .single()

    const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
    if (orderUser?.email) {
      sendOrderConfirmationEmail(
        {
          ...order,
          status: 'processing',
          payment_status: 'pending',
          tracking_number:
            updatedOrder?.tracking_number || order.tracking_number,
        },
        orderUser.email
      ).catch((error) =>
        logger.error('COD order confirmation email failed', {
          error,
          orderId: order_id,
        })
      )
    }

    return NextResponse.json({ success: true, shipment })
  } catch (error) {
    logger.error('COD confirmation failed', { error })
    return NextResponse.json({ error: 'Failed to place COD order' }, { status: 500 })
  }
}
