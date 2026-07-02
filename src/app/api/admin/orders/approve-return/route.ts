import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createDelhiveryReversePickupForItem } from '@/lib/delhivery-shipping'
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
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      )
    }

    const { data: item, error: itemError } = await supabase
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

    if (item.return_status !== 'return_requested') {
      return NextResponse.json(
        { error: 'Only pending return or exchange requests can be approved' },
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

    const { error } = await supabase
      .from('order_items')
      .update({
        return_status: 'return_approved',
        status: nextStatus,
        return_approved_at: new Date().toISOString(),
      })
      .eq('id', item_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', item.order_id)

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
