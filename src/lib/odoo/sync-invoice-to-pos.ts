import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/server"
import { applyStockMovement, getOpenPosSession } from "@/lib/inventory"
import logger from "@/lib/logger"
import {
  LFOUR37_BRAND_ID,
  LFOUR37_ONLINE_LOCATION_ID,
  LFOUR37_STORE_JAMNAGAR_LOCATION_ID,
  YADEVI_COMPANY_ID,
} from "@/lib/organization"
import {
  fetchMaxPostedInvoiceId,
  fetchPostedInvoicesAfter,
  isOdooConfigured,
  type OdooInvoice,
  type OdooPaymentInfo,
} from "@/lib/odoo/client"

const CURSOR_KEY = "odoo_pos_last_move_id"
const STORE_LOCATION_ID = LFOUR37_STORE_JAMNAGAR_LOCATION_ID
const ONLINE_LOCATION_ID = LFOUR37_ONLINE_LOCATION_ID
const BRAND_ID = LFOUR37_BRAND_ID

export type OdooPosSyncResult = {
  checked: number
  created: number
  skipped: number
  failed: number
  errors: Array<{ invoice: string; error: string }>
}

type PosPaymentMethod = "cash" | "upi" | "card" | "mixed"

type ResolvedLine = {
  product_id: string
  variant_id: string
  product_name: string
  variant_size: string
  variant_color: string
  barcode: string
  quantity: number
  unit_price: number
  line_total: number
  from_store: number
  from_online: number
}

function mapPaymentMethod(
  payments: OdooPaymentInfo[],
  paymentState: string
): {
  method: PosPaymentMethod
  amount_cash: number
  amount_upi: number
  amount_card: number
} {
  const buckets = { cash: 0, upi: 0, card: 0 }

  for (const payment of payments) {
    const journal = payment.journalName.toLowerCase()
    let bucket: keyof typeof buckets = "upi"
    if (journal.includes("cash") || journal.includes("cod")) {
      bucket = "cash"
    } else if (
      journal.includes("pos") ||
      journal.includes("card") ||
      journal.includes("machine")
    ) {
      bucket = "card"
    } else if (
      journal.includes("upi") ||
      journal.includes("razorpay") ||
      journal.includes("icici") ||
      journal.includes("sbi") ||
      journal.includes("bank")
    ) {
      bucket = "upi"
    }
    buckets[bucket] += Number(payment.amount) || 0
  }

  const filled = (Object.keys(buckets) as Array<keyof typeof buckets>).filter(
    (key) => buckets[key] > 0
  )

  if (filled.length === 0) {
    // Unpaid / COD still open — record as cash for reporting until collected.
    if (paymentState === "not_paid" || paymentState === "in_payment") {
      return { method: "cash", amount_cash: 0, amount_upi: 0, amount_card: 0 }
    }
    return { method: "cash", amount_cash: 0, amount_upi: 0, amount_card: 0 }
  }

  if (filled.length > 1) {
    return {
      method: "mixed",
      amount_cash: Number(buckets.cash.toFixed(2)),
      amount_upi: Number(buckets.upi.toFixed(2)),
      amount_card: Number(buckets.card.toFixed(2)),
    }
  }

  const only = filled[0]
  return {
    method: only,
    amount_cash: only === "cash" ? Number(buckets.cash.toFixed(2)) : 0,
    amount_upi: only === "upi" ? Number(buckets.upi.toFixed(2)) : 0,
    amount_card: only === "card" ? Number(buckets.card.toFixed(2)) : 0,
  }
}

async function getCursor(admin: SupabaseClient): Promise<number | null> {
  const envFloor = Number(process.env.ODOO_POS_SYNC_AFTER_MOVE_ID || "")
  const { data, error } = await admin
    .from("sync_cursors")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (data?.value != null && data.value !== "") {
    const stored = Number(data.value)
    if (!Number.isFinite(stored)) return Number.isFinite(envFloor) ? envFloor : 0
    if (Number.isFinite(envFloor)) return Math.max(stored, envFloor)
    return stored
  }
  return null
}

async function setCursor(admin: SupabaseClient, moveId: number): Promise<void> {
  const { error } = await admin.from("sync_cursors").upsert(
    {
      key: CURSOR_KEY,
      value: String(moveId),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  )
  if (error) throw new Error(error.message)
}

async function ensureCursor(admin: SupabaseClient): Promise<number> {
  const existing = await getCursor(admin)
  if (existing != null) return existing

  const envFloor = Number(process.env.ODOO_POS_SYNC_AFTER_MOVE_ID || "")
  if (Number.isFinite(envFloor) && envFloor > 0) {
    await setCursor(admin, envFloor)
    return envFloor
  }

  // First run: watermark at current max so only future invoices sync.
  const maxId = await fetchMaxPostedInvoiceId()
  await setCursor(admin, maxId)
  logger.info("Odoo POS sync watermark initialized", { maxId })
  return maxId
}

async function alreadySynced(
  admin: SupabaseClient,
  moveId: number
): Promise<boolean> {
  const { data, error } = await admin
    .from("pos_sales")
    .select("id")
    .eq("odoo_move_id", moveId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data?.id)
}

async function resolveLines(
  admin: SupabaseClient,
  invoice: OdooInvoice
): Promise<ResolvedLine[]> {
  if (invoice.lines.length === 0) {
    throw new Error("Invoice has no product lines")
  }

  const missingBarcode = invoice.lines.filter((line) => !line.barcode?.trim())
  if (missingBarcode.length > 0) {
    throw new Error(
      `Missing Odoo barcode on ${missingBarcode.length} line(s): ${missingBarcode
        .slice(0, 3)
        .map((line) => line.name)
        .join("; ")}`
    )
  }

  const barcodes = [...new Set(invoice.lines.map((line) => line.barcode!.trim()))]
  const { data: variants, error } = await admin
    .from("product_variants")
    .select(
      `
      id, size, color, stock, barcode, price_modifier, is_active,
      product:products!inner(id, name, price, brand_id, status)
    `
    )
    .in("barcode", barcodes)
    .eq("is_active", true)
    .eq("product.brand_id", BRAND_ID)

  if (error) throw new Error(error.message)

  const byBarcode = new Map<string, (typeof variants)[number]>()
  for (const row of variants || []) {
    const code = String(row.barcode || "").trim()
    if (code) byBarcode.set(code, row)
  }

  const unresolved = invoice.lines.filter(
    (line) => !byBarcode.has(line.barcode!.trim())
  )
  if (unresolved.length > 0) {
    throw new Error(
      `No website variant for barcode(s): ${unresolved
        .slice(0, 5)
        .map((line) => `${line.barcode} (${line.name})`)
        .join("; ")}`
    )
  }

  const variantIds = invoice.lines.map(
    (line) => byBarcode.get(line.barcode!.trim())!.id as string
  )
  const { data: levels } = await admin
    .from("stock_levels")
    .select("location_id, variant_id, quantity")
    .in("location_id", [STORE_LOCATION_ID, ONLINE_LOCATION_ID])
    .in("variant_id", variantIds)

  const storeMap = new Map<string, number>()
  const onlineMap = new Map<string, number>()
  for (const row of levels || []) {
    const qty = Number(row.quantity)
    if (row.location_id === STORE_LOCATION_ID) {
      storeMap.set(row.variant_id as string, qty)
    } else if (row.location_id === ONLINE_LOCATION_ID) {
      onlineMap.set(row.variant_id as string, qty)
    }
  }

  const resolved: ResolvedLine[] = []
  for (const line of invoice.lines) {
    const variant = byBarcode.get(line.barcode!.trim())!
    const product = Array.isArray(variant.product)
      ? variant.product[0]
      : variant.product
    if (!product || product.status !== "active") {
      throw new Error(`Product inactive for barcode ${line.barcode}`)
    }

    const qty = Math.round(line.quantity)
    if (qty <= 0) {
      throw new Error(`Invalid quantity for ${line.name}`)
    }

    const storeQty = storeMap.get(variant.id as string) ?? 0
    const onlineQty =
      onlineMap.get(variant.id as string) ?? Number(variant.stock) ?? 0
    const available = storeQty + onlineQty
    if (available < qty) {
      throw new Error(
        `Insufficient stock for ${product.name} (${variant.size}/${variant.color}): need ${qty}, have ${available}`
      )
    }

    const fromStore = Math.min(storeQty, qty)
    const fromOnline = qty - fromStore
    const unitPrice =
      qty > 0
        ? Number((line.priceSubtotal / line.quantity).toFixed(2))
        : Number(line.priceUnit)
    const lineTotal = Number(line.priceSubtotal.toFixed(2))

    resolved.push({
      product_id: product.id as string,
      variant_id: variant.id as string,
      product_name: product.name as string,
      variant_size: variant.size as string,
      variant_color: variant.color as string,
      barcode: line.barcode!.trim(),
      quantity: qty,
      unit_price: unitPrice,
      line_total: lineTotal,
      from_store: fromStore,
      from_online: fromOnline,
    })

    storeMap.set(variant.id as string, storeQty - fromStore)
    onlineMap.set(variant.id as string, onlineQty - fromOnline)
  }

  return resolved
}

async function ensureSession(admin: SupabaseClient) {
  let session = await getOpenPosSession(STORE_LOCATION_ID)
  if (session) return session

  const { data: opened, error } = await admin
    .from("pos_sessions")
    .insert({
      company_id: YADEVI_COMPANY_ID,
      brand_id: BRAND_ID,
      location_id: STORE_LOCATION_ID,
      opened_by: null,
      opening_float: 0,
      status: "open",
      notes: "Opened by Odoo POS sync",
    })
    .select()
    .single()

  if (error || !opened) {
    throw new Error(error?.message || "Failed to open POS session")
  }
  return opened
}

async function createPosSaleFromInvoice(
  admin: SupabaseClient,
  invoice: OdooInvoice
): Promise<string> {
  const lines = await resolveLines(admin, invoice)
  const session = await ensureSession(admin)

  const subtotal = Number(
    lines.reduce((sum, line) => sum + line.line_total, 0).toFixed(2)
  )
  const taxAmount = Number(invoice.amountTax.toFixed(2))
  const total = Number(invoice.amountTotal.toFixed(2))
  const discount = Math.max(
    0,
    Number((subtotal + taxAmount - total).toFixed(2))
  )

  const payment = mapPaymentMethod(invoice.payments, invoice.paymentState)
  let amountCash = payment.amount_cash
  let amountUpi = payment.amount_upi
  let amountCard = payment.amount_card

  if (payment.method === "mixed") {
    const paid = Number((amountCash + amountUpi + amountCard).toFixed(2))
    if (Math.abs(paid - total) > 0.05) {
      const scale = paid > 0 ? total / paid : 1
      amountCash = Number((amountCash * scale).toFixed(2))
      amountUpi = Number((amountUpi * scale).toFixed(2))
      amountCard = Number((total - amountCash - amountUpi).toFixed(2))
    }
  } else {
    amountCash = payment.method === "cash" ? total : 0
    amountUpi = payment.method === "upi" ? total : 0
    amountCard = payment.method === "card" ? total : 0
  }

  const { data: saleNumberData } = await admin.rpc("next_pos_sale_number")
  const saleNumber =
    (saleNumberData as string) || `POS-ODOO-${invoice.id}`

  const notes = [
    `Odoo ${invoice.name}`,
    invoice.partnerName ? `Customer: ${invoice.partnerName}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const { data: sale, error: saleError } = await admin
    .from("pos_sales")
    .insert({
      session_id: session.id,
      company_id: session.company_id || YADEVI_COMPANY_ID,
      brand_id: session.brand_id || BRAND_ID,
      location_id: session.location_id || STORE_LOCATION_ID,
      sale_number: saleNumber,
      subtotal,
      discount_amount: discount,
      tax_amount: taxAmount,
      total,
      payment_method: payment.method,
      amount_cash: amountCash,
      amount_upi: amountUpi,
      amount_card: amountCard,
      status: "completed",
      notes,
      created_by: null,
      odoo_move_id: invoice.id,
      odoo_invoice_name: invoice.name,
      odoo_sync_error: null,
    })
    .select()
    .single()

  if (saleError || !sale) {
    throw new Error(saleError?.message || "Failed to create POS sale")
  }

  const { error: itemsError } = await admin.from("pos_sale_items").insert(
    lines.map((line) => ({
      sale_id: sale.id,
      product_id: line.product_id,
      variant_id: line.variant_id,
      product_name: line.product_name,
      variant_size: line.variant_size,
      variant_color: line.variant_color,
      barcode: line.barcode,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
    }))
  )

  if (itemsError) {
    await admin.from("pos_sales").delete().eq("id", sale.id)
    throw new Error(itemsError.message)
  }

  try {
    const onlineMap = new Map<string, number>()
    for (const line of lines) {
      if (line.from_store > 0) {
        await applyStockMovement({
          variantId: line.variant_id,
          delta: -line.from_store,
          movementType: "pos_sale",
          locationId: STORE_LOCATION_ID,
          referenceType: "pos_sale",
          referenceId: sale.id,
          notes: `${sale.sale_number} store (Odoo ${invoice.name})`,
        })

        const { data: onlineLevel } = await admin
          .from("stock_levels")
          .select("quantity")
          .eq("location_id", ONLINE_LOCATION_ID)
          .eq("variant_id", line.variant_id)
          .maybeSingle()

        let onlineHave = onlineLevel
          ? Number(onlineLevel.quantity)
          : onlineMap.has(line.variant_id)
            ? onlineMap.get(line.variant_id)!
            : null

        if (onlineHave == null) {
          const { data: variantRow } = await admin
            .from("product_variants")
            .select("stock")
            .eq("id", line.variant_id)
            .maybeSingle()
          const websiteQty = Number(variantRow?.stock || 0)
          if (websiteQty > 0) {
            await admin.from("stock_levels").upsert(
              {
                location_id: ONLINE_LOCATION_ID,
                variant_id: line.variant_id,
                quantity: websiteQty,
              },
              { onConflict: "location_id,variant_id" }
            )
            onlineHave = websiteQty
          } else {
            onlineHave = 0
          }
        }

        const websiteDrop = Math.min(line.from_store, Math.max(0, onlineHave))
        if (websiteDrop > 0) {
          await applyStockMovement({
            variantId: line.variant_id,
            delta: -websiteDrop,
            movementType: "pos_sale",
            locationId: ONLINE_LOCATION_ID,
            referenceType: "pos_sale",
            referenceId: sale.id,
            notes: `${sale.sale_number} website reduced for Odoo store sale`,
          })
          onlineMap.set(line.variant_id, onlineHave - websiteDrop)
        } else {
          onlineMap.set(line.variant_id, onlineHave)
        }
      }

      if (line.from_online > 0) {
        await applyStockMovement({
          variantId: line.variant_id,
          delta: -line.from_online,
          movementType: "pos_sale",
          locationId: ONLINE_LOCATION_ID,
          referenceType: "pos_sale",
          referenceId: sale.id,
          notes: `${sale.sale_number} shared-online (Odoo ${invoice.name})`,
        })
      }

      const { data: productRow } = await admin
        .from("products")
        .select("total_sold")
        .eq("id", line.product_id)
        .single()

      await admin
        .from("products")
        .update({
          total_sold: Number(productRow?.total_sold || 0) + line.quantity,
        })
        .eq("id", line.product_id)
    }
  } catch (error) {
    await admin.from("pos_sales").delete().eq("id", sale.id)
    throw error instanceof Error
      ? error
      : new Error("Stock deduction failed")
  }

  return sale.id as string
}

export async function syncOdooInvoicesToPos(
  limit = 20
): Promise<OdooPosSyncResult> {
  if (!isOdooConfigured()) {
    return {
      checked: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [{ invoice: "-", error: "Odoo is not configured" }],
    }
  }

  const admin = createAdminClient()
  const result: OdooPosSyncResult = {
    checked: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const watermark = await ensureCursor(admin)
  const invoices = await fetchPostedInvoicesAfter(
    watermark,
    Math.min(Math.max(limit, 1), 50)
  )
  result.checked = invoices.length

  for (const invoice of invoices) {
    try {
      if (await alreadySynced(admin, invoice.id)) {
        await setCursor(admin, invoice.id)
        result.skipped += 1
        continue
      }

      await createPosSaleFromInvoice(admin, invoice)
      await setCursor(admin, invoice.id)
      result.created += 1
      logger.info("Odoo invoice synced to POS", {
        moveId: invoice.id,
        name: invoice.name,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed"
      result.failed += 1
      result.errors.push({ invoice: invoice.name, error: message })
      logger.error("Odoo invoice POS sync failed", {
        moveId: invoice.id,
        name: invoice.name,
        error: message,
      })
      // Stop advancing watermark so this invoice retries after barcodes/stock are fixed.
      break
    }
  }

  return result
}
