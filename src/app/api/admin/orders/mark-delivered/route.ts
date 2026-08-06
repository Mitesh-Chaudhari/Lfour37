import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markCodCollectedOnDelivery } from '@/lib/cod-payment'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { orderId } = await req.json()

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
    }

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('payment_method, payment_status')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await markCodCollectedOnDelivery(orderId, updatedOrder, supabase)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed' },
      { status: 500 }
    )
  }
}
