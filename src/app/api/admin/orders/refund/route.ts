import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processFullOrderRefund } from '@/lib/refunds'
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

    const { order_id } = await req.json()
    if (!order_id) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 })
    }

    const results = await processFullOrderRefund(order_id)

    return NextResponse.json({
      success: true,
      refunded_items: results.length,
      results,
      message:
        'Full order refund initiated. Amount will reflect in 5-7 business days for online payments.',
    })
  } catch (error) {
    logger.error('Refund error', { error })
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process refund',
      },
      { status: 500 }
    )
  }
}
