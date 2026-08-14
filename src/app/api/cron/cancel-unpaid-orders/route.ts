import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cancelExpiredUnpaidOrders } from '@/lib/cancel-unpaid-orders'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  const secret =
    process.env.CANCEL_UNPAID_ORDERS_CRON_SECRET ||
    process.env.DELHIVERY_CRON_SECRET ||
    process.env.ABANDONED_CART_CRON_SECRET

  const authorization = request.headers.get('authorization')
  const isManualCall = Boolean(secret) && authorization === `Bearer ${secret}`

  return isVercelCron || isManualCall
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const limit = Math.min(
      Number(request.nextUrl.searchParams.get('limit') || 100),
      200
    )

    const result = await cancelExpiredUnpaidOrders(admin, { limit })

    logger.info('Cancelled expired unpaid pending orders', result)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    logger.error('Cancel unpaid orders cron failed', { error })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
