import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

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

    const { data: item, error: itemError } = await admin
      .from('order_items')
      .select(`
        id,
        order_id,
        return_status
      `)
      .eq('id', item_id)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const { data: updatedItem, error: updateError } = await admin
      .from('order_items')
      .update({
        return_status: 'return_rejected',
        status: 'delivered',
      })
      .eq('id', item_id)
      .select('id, return_status')
      .single()

    if (updateError || !updatedItem) {
      logger.error('Reject return item update failed', {
        error: updateError,
        itemId: item_id,
      })
      return NextResponse.json(
        { error: updateError?.message || 'Failed to reject return' },
        { status: 500 }
      )
    }

    await admin
      .from('orders')
      .update({
        status: 'delivered',
      })
      .eq('id', item.order_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Reject return failed', { err })
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
