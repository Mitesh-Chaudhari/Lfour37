import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createDelhiveryReversePickupForItem } from '@/lib/delhivery-shipping'
import logger from '@/lib/logger'
import { getOrderFulfillmentStatus } from '@/lib/order-status'

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
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      )
    }

    // Use service role so updates are not blocked by customer-only RLS.
    const { data: item, error: itemError } = await admin
      .from('order_items')
      .select(`
        id,
        order_id,
        return_type,
        return_status
      `)
      .eq('id', item_id)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (
      item.return_status !== 'return_requested' &&
      item.return_status !== 'return_approved'
    ) {
      return NextResponse.json(
        { error: 'Only pending or already-approved return/exchange requests can be processed' },
        { status: 400 }
      )
    }

    const delhiveryResult = await createDelhiveryReversePickupForItem(item_id)
    if (!delhiveryResult.ok) {
      return NextResponse.json(
        {
          error:
            delhiveryResult.error ||
            'Failed to create Delhivery reverse pickup for this item',
        },
        { status: 502 }
      )
    }

    const isExchange = item.return_type === 'exchange'
    const nextStatus = isExchange ? 'exchange_initiated' : 'return_initiated'

    // Always persist approval even when reverse AWB already existed from a
    // previous attempt (Delhivery succeeded, item status update had failed).
    const { data: updatedItem, error } = await admin
      .from('order_items')
      .update({
        return_status: 'return_approved',
        status: nextStatus,
        return_approved_at: new Date().toISOString(),
      })
      .eq('id', item_id)
      .select('id, return_status, status')
      .single()

    if (error || !updatedItem) {
      logger.error('Approve return item update failed', {
        error,
        itemId: item_id,
      })
      return NextResponse.json(
        {
          error:
            error?.message ||
            'Failed to update return status. Reverse pickup may already exist — retry approve.',
        },
        { status: 500 }
      )
    }

    const { data: order } = await admin
      .from('orders')
      .select('status, shipped_at, delivered_at, tracking_number, payment_status')
      .eq('id', item.order_id)
      .single()

    const { data: orderItems } = await admin
      .from('order_items')
      .select('status, return_status')
      .eq('order_id', item.order_id)

    if (order && orderItems) {
      await admin
        .from('orders')
        .update({
          status: getOrderFulfillmentStatus(order, orderItems),
        })
        .eq('id', item.order_id)
    }

    return NextResponse.json({
      success: true,
      delhivery: {
        reverseAwb: delhiveryResult.reverseAwb,
        exchangeForwardAwb: delhiveryResult.exchangeForwardAwb,
      },
    })
  } catch (error) {
    logger.error('Approve return failed', { error })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
