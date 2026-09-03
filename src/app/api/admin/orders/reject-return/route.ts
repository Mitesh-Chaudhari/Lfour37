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

    if (item.return_status !== 'return_requested') {
      return NextResponse.json(
        {
          error:
            item.return_status === 'return_approved'
              ? 'This return/exchange was already approved elsewhere. Refresh the page to see the latest status.'
              : item.return_status === 'return_rejected'
                ? 'This return/exchange was already rejected. Refresh the page to see the latest status.'
                : 'Only pending return/exchange requests can be rejected.',
          code: 'already_processed',
        },
        { status: 409 }
      )
    }

    // Conditional update — loses cleanly if Orders/Returns page already acted.
    const { data: updatedItem, error: updateError } = await admin
      .from('order_items')
      .update({
        return_status: 'return_rejected',
        status: 'delivered',
      })
      .eq('id', item_id)
      .eq('return_status', 'return_requested')
      .select('id, return_status')
      .maybeSingle()

    if (updateError) {
      logger.error('Reject return item update failed', {
        error: updateError,
        itemId: item_id,
      })
      return NextResponse.json(
        { error: updateError.message || 'Failed to reject return' },
        { status: 500 }
      )
    }

    if (!updatedItem) {
      return NextResponse.json(
        {
          error:
            'This return/exchange was already handled elsewhere. Refresh the page to see the latest status.',
          code: 'already_processed',
        },
        { status: 409 }
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
