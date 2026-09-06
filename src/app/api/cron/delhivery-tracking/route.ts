import { NextRequest, NextResponse } from 'next/server'
import {
  syncActiveDelhiveryReversePickups,
  syncActiveDelhiveryShipments,
} from '@/lib/delhivery-shipping'
import { isCronRequestAuthorized } from '@/lib/cron-auth'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest
) {
  if (
    !isCronRequestAuthorized(request, [
      process.env.DELHIVERY_CRON_SECRET,
    ])
  ) {
    return NextResponse.json(
      {
        error:
          'Unauthorized',
      },
      {
        status: 401,
      }
    )
  }

  try {
    const limit = Number(
      request.nextUrl.searchParams.get(
        'limit'
      ) || 50
    )

    const results =
      await syncActiveDelhiveryShipments(
        limit
      )

    const reverseSynced =
      await syncActiveDelhiveryReversePickups(
        limit
      )

    return NextResponse.json({
      success: true,
      synced:
        results.filter(
          (result) =>
            result.success
        ).length,
      failed:
        results.filter(
          (result) =>
            !result.success
        ).length,
      reverse_synced: reverseSynced,
      results,
    })
  } catch (error) {
    logger.error(
      'Delhivery cron sync failed',
      { error }
    )

    return NextResponse.json(
      {
        error:
          'Tracking sync failed',
      },
      {
        status: 500,
      }
    )
  }
}
