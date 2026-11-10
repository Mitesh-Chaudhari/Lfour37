import { NextRequest, NextResponse } from "next/server"
import { isCronRequestAuthorized } from "@/lib/cron-auth"
import { syncOdooInvoicesToErpNext } from "@/lib/odoo/sync-invoice-to-erpnext"
import { syncOdooProductsToErpNext } from "@/lib/odoo/sync-product-to-erpnext"
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
    // Products first so new Odoo variants exist before invoice lines resolve.
    const products = await syncOdooProductsToErpNext(
      Math.min(Math.max(limit * 2, 20), 100)
    )
    const invoices = await syncOdooInvoicesToErpNext(limit)
    logger.info("Odoo→ERPNext sync cron finished", { products, invoices })
    return NextResponse.json({ success: true, products, invoices })
  } catch (error) {
    logger.error("Odoo→ERPNext sync cron failed", { error })
    const message =
      error instanceof Error ? error.message : "Odoo→ERPNext sync failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
