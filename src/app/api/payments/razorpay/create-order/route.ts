import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRazorpayOrder } from '@/lib/razorpay'
import { z } from 'zod'

const schema = z.object({
  order_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { order_id } = parsed.data

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const razorpayOrder = await createRazorpayOrder(order.total, order_id)

    // Save payment
    await supabase.from('payments').insert({
      order_id,
      payment_method: 'razorpay',
      status: 'pending',
      amount: order.total,
      currency: 'INR',
      razorpay_order_id: razorpayOrder.id,
    })

    return NextResponse.json({
      id: razorpayOrder.id,          // ✅ FIXED
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}