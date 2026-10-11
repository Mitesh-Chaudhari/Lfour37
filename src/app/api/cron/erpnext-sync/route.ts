import { NextRequest, NextResponse } from "next/server"
import { isCronRequestAuthorized } from "@/lib/cron-auth"
import { syncRecentOrdersToErpNext } from "@/lib/erpnext/sync-order"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (
    !isCronRequestAuthorized(request, [
      process.env.ERPNEXT_CRON_SECRET,
      process.env.DELHIVERY_CRON_SECRET,
    ])
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 20), 50)
    const result = await syncRecentOrdersToErpNext(limit)
    logger.info("ERPNext order sync cron finished", result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    logger.error("ERPNext order sync cron failed", { error })
    const message = error instanceof Error ? error.message : "ERPNext sync failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
