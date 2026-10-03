import { NextRequest, NextResponse } from 'next/server'
import { isCronRequestAuthorized } from '@/lib/cron-auth'
import { sendDueCodDispatchReminders } from '@/lib/cod-dispatch-confirm'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (
    !isCronRequestAuthorized(request, [
      process.env.DELHIVERY_CRON_SECRET,
    ])
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sent = await sendDueCodDispatchReminders()
    return NextResponse.json({ success: true, sent })
  } catch (error) {
    logger.error('COD dispatch confirm cron failed', { error })
    return NextResponse.json({ error: 'COD dispatch confirm failed' }, { status: 500 })
  }
}
