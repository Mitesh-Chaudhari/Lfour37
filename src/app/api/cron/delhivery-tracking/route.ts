import { NextRequest, NextResponse } from 'next/server'
import {
  syncActiveDelhiveryReversePickups,
  syncActiveDelhiveryShipments,
} from '@/lib/delhivery-shipping'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest
) {
  const isVercelCron =
    request.headers.get(
      'x-vercel-cron'
    ) === '1'

  const secret =
    process.env
      .DELHIVERY_CRON_SECRET

  const authorization =
    request.headers.get(
      'authorization'
    )

  const isManualCall =
    authorization ===
    `Bearer ${secret}`

  if (
    !isVercelCron &&
    !isManualCall
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
