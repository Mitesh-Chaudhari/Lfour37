import { NextRequest, NextResponse } from "next/server"
import { isCronRequestAuthorized } from "@/lib/cron-auth"
import { backfillMissingOdooInvoicesToErpNext } from "@/lib/odoo/sync-invoice-to-erpnext"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

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
    const result = await backfillMissingOdooInvoicesToErpNext()
    logger.info("Odoo→ERPNext backfill finished", result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    logger.error("Odoo→ERPNext backfill failed", { error })
    const message =
      error instanceof Error ? error.message : "Odoo→ERPNext backfill failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
