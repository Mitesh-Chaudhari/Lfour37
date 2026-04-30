import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
    } = body

    console.log('VERIFY BODY:', body)
    console.log("ORDER ID RECEIVED:", razorpay_order_id)

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    console.log('EXPECTED:', generatedSignature)
    console.log('RECEIVED:', razorpay_signature)

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const supabase = await createClient()

    // ✅ IMPORTANT: update using YOUR order_id (not razorpay_order_id)
    await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_status: 'completed',
      })
      .eq('id', order_id)

    await supabase.from('order_tracking').insert({
      order_id,
      status: 'placed',
      description: 'Order placed successfully',
    })

    await supabase
      .from('payments')
      .update({
        status: 'completed',
        razorpay_payment_id,
      })
      .eq('order_id', order_id) // ✅ FIXED

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}