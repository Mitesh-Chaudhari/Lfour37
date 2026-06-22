import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processItemRefund } from '@/lib/refunds'
import logger from '@/lib/logger'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
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

    const { data: item, error: itemError } = await supabase
      .from('order_items')
      .select('id, order_id, status')
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

    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        status: 'cancelled',
      })
      .eq('id', item_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { data: order } = await supabase
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
          refund_error:
            refundError instanceof Error
              ? refundError.message
              : 'Refund failed',
        })
      }
    }

    const { data: siblings } = await supabase
      .from('order_items')
      .select('status')
      .eq('order_id', item.order_id)

    const allCancelled = siblings?.every(
      (sibling) => sibling.status === 'cancelled'
    )

    if (allCancelled) {
      await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', item.order_id)
    }

    return NextResponse.json({
      success: true,
      cancelled: true,
      refund,
    })
  } catch (error) {
    logger.error('Cancel approve failed', { error })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
