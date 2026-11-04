import { NextRequest, NextResponse } from "next/server"
import { isCronRequestAuthorized } from "@/lib/cron-auth"
import { syncOdooInvoicesToPos } from "@/lib/odoo/sync-invoice-to-pos"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (
    !isCronRequestAuthorized(request, [
      process.env.ODOO_CRON_SECRET,
      process.env.CRON_SECRET,
      process.env.DELHIVERY_CRON_SECRET,
    ])
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") || 20),
      50
    )
    const result = await syncOdooInvoicesToPos(limit)
    logger.info("Odoo POS sync cron finished", result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    logger.error("Odoo POS sync cron failed", { error })
    const message =
      error instanceof Error ? error.message : "Odoo POS sync failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
