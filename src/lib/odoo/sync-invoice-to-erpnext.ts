import { createAdminClient } from "@/lib/supabase/server"
import logger from "@/lib/logger"
import {
  erpCall,
  erpFetch,
  erpGet,
  erpGetList,
  erpInsert,
  erpSubmit,
  erpUpdate,
  isErpNextConfigured,
} from "@/lib/erpnext/client"
import {
  fetchMaxPostedInvoiceId,
  fetchPostedInvoicesAfter,
  fetchPostedInvoicesByIds,
  isOdooConfigured,
  listPostedInvoiceRefs,
  type OdooInvoice,
  type OdooPaymentInfo,
} from "@/lib/odoo/client"

const CURSOR_KEY = "odoo_erpnext_last_move_id"
const COMPANY = "Yadevi Lifestyle Private Limited"
const WAREHOUSE = "Store Jamnagar - S"
const PRICE_LIST = "Store Selling"
const CUSTOMER_GROUP = "Individual"
const TERRITORY = "India"
const RECEIVABLE = "Debtors - S"
const COST_CENTER = "Main - S"
const COMPANY_GSTIN = "24AACCY1267A1ZR"
const INVOICE_SERIES = "JMN-INV-.YY.-.#####"
const TAX_IN_STATE = "LFOUR37 GST In-State 5% - S"
const TAX_OUT_STATE = "LFOUR37 GST Out-State 5% - S"

const GST_STATE_BY_NAME: Record<string, string> = {
  "jammu and kashmir": "01-Jammu and Kashmir",
  "himachal pradesh": "02-Himachal Pradesh",
  punjab: "03-Punjab",
  chandigarh: "04-Chandigarh",
  uttarakhand: "05-Uttarakhand",
  haryana: "06-Haryana",
  delhi: "07-Delhi",
  rajasthan: "08-Rajasthan",
  "uttar pradesh": "09-Uttar Pradesh",
  bihar: "10-Bihar",
  sikkim: "11-Sikkim",
  "arunachal pradesh": "12-Arunachal Pradesh",
  nagaland: "13-Nagaland",
  manipur: "14-Manipur",
  mizoram: "15-Mizoram",
  tripura: "16-Tripura",
  meghalaya: "17-Meghalaya",
  assam: "18-Assam",
  "west bengal": "19-West Bengal",
  jharkhand: "20-Jharkhand",
  odisha: "21-Odisha",
  orissa: "21-Odisha",
  chhattisgarh: "22-Chhattisgarh",
  chattisgarh: "22-Chhattisgarh",
  "madhya pradesh": "23-Madhya Pradesh",
  gujarat: "24-Gujarat",
  "dadra and nagar haveli and daman and diu":
    "26-Dadra and Nagar Haveli and Daman and Diu",
  maharashtra: "27-Maharashtra",
  karnataka: "29-Karnataka",
  goa: "30-Goa",
  lakshadweep: "31-Lakshadweep",
  kerala: "32-Kerala",
  "tamil nadu": "33-Tamil Nadu",
  puducherry: "34-Puducherry",
  pondicherry: "34-Puducherry",
  "andaman and nicobar islands": "35-Andaman and Nicobar Islands",
  telangana: "36-Telangana",
  "andhra pradesh": "37-Andhra Pradesh",
  ladakh: "38-Ladakh",
}

export type OdooErpNextSyncResult = {
  checked: number
  created: number
  skipped: number
  paymentsUpdated: number
  failed: number
  errors: Array<{ invoice: string; error: string }>
}

function placeOfSupply(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d{2}-/.test(trimmed)) return trimmed
  // Odoo state names sometimes look like "Gujarat (IN)" or "24-Gujarat"
  const withoutCountry = trimmed.replace(/\s*\(.*\)\s*$/, "").trim()
  if (/^\d{2}-/.test(withoutCountry)) return withoutCountry
  return (
    GST_STATE_BY_NAME[withoutCountry.toLowerCase()] ||
    GST_STATE_BY_NAME[trimmed.toLowerCase()] ||
    null
  )
}

function gstCategory(treatment: string | null): string {
  const value = (treatment || "").toLowerCase()
  if (value.includes("regular")) return "Registered Regular"
  if (value.includes("composition")) return "Registered Composition"
  if (value.includes("overseas") || value.includes("export")) return "Overseas"
  if (value.includes("sez")) return "SEZ"
  return "Unregistered"
}

function taxTemplateFor(supply: string | null): string {
  if (!supply || supply.startsWith("24-")) return TAX_IN_STATE
  return TAX_OUT_STATE
}

function cleanTaxRow(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object") return null
  const tax = { ...(row as Record<string, unknown>) }
  for (const key of [
    "name",
    "idx",
    "parent",
    "parentfield",
    "parenttype",
    "docstatus",
  ]) {
    delete tax[key]
  }
  tax.included_in_print_rate = 0
  return tax
}

async function loadGstTaxes(supply: string | null) {
  const template = taxTemplateFor(supply)
  const message = await erpCall(
    "erpnext.controllers.accounts_controller.get_taxes_and_charges",
    {
      master_doctype: "Sales Taxes and Charges Template",
      master_name: template,
    }
  )
  const taxes = (Array.isArray(message) ? message : [])
    .map(cleanTaxRow)
    .filter((row): row is Record<string, unknown> => Boolean(row))
  if (taxes.length === 0) {
    throw new Error(`GST template ${template} has no tax rows`)
  }
  return { template, taxes }
}

function mapJournalToMode(journalName: string): {
  mode: string
  account: string
} {
  const journal = journalName.toLowerCase()
  if (journal.includes("cash") || journal.includes("cod")) {
    return { mode: "Cash", account: "Cash - S" }
  }
  if (
    journal.includes("pos") ||
    journal.includes("card") ||
    journal.includes("machine")
  ) {
    return { mode: "Card", account: "Online Payments - S" }
  }
  if (journal.includes("razorpay")) {
    return { mode: "Razorpay", account: "Online Payments - S" }
  }
  if (journal.includes("upi") || journal.includes("icici")) {
    return { mode: "UPI", account: "Online Payments - S" }
  }
  if (journal.includes("sbi") || journal.includes("bank")) {
    return { mode: "Wire Transfer", account: "Online Payments - S" }
  }
  return { mode: "UPI", account: "Online Payments - S" }
}

async function getCursor(): Promise<number | null> {
  const admin = createAdminClient()
  const envFloor = Number(process.env.ODOO_ERPNEXT_SYNC_AFTER_MOVE_ID || "")
  const { data, error } = await admin
    .from("sync_cursors")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data?.value != null && data.value !== "") {
    const stored = Number(data.value)
    if (!Number.isFinite(stored)) {
      return Number.isFinite(envFloor) ? envFloor : 0
    }
    if (Number.isFinite(envFloor)) return Math.max(stored, envFloor)
    return stored
  }
  return null
}

async function setCursor(moveId: number): Promise<void> {
  const admin = createAdminClient()
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

async function ensureCursor(): Promise<number> {
  const existing = await getCursor()
  if (existing != null) return existing

  const envFloor = Number(process.env.ODOO_ERPNEXT_SYNC_AFTER_MOVE_ID || "")
  if (Number.isFinite(envFloor) && envFloor > 0) {
    await setCursor(envFloor)
    return envFloor
  }

  const maxId = await fetchMaxPostedInvoiceId()
  await setCursor(maxId)
  logger.info("Odoo→ERPNext sync watermark initialized", { maxId })
  return maxId
}

function pickExistingName(
  rows: Array<Record<string, unknown>>
): string | null {
  const submitted = rows.find((row) => Number(row.docstatus) === 1)
  const name = (submitted || rows[0])?.name
  return typeof name === "string" ? name : null
}

async function findExistingInvoice(
  moveId: number,
  invoiceName?: string | null
): Promise<string | null> {
  const byMove = await erpGetList(
    "Sales Invoice",
    [
      ["custom_odoo_move_id", "=", String(moveId)],
      ["docstatus", "!=", 2],
    ],
    ["name", "docstatus"]
  )
  const fromMove = pickExistingName(byMove)
  if (fromMove) return fromMove

  if (invoiceName) {
    const byCustomName = await erpGetList(
      "Sales Invoice",
      [
        ["custom_odoo_invoice_name", "=", invoiceName],
        ["docstatus", "!=", 2],
      ],
      ["name", "docstatus"]
    )
    const fromCustom = pickExistingName(byCustomName)
    if (fromCustom) return fromCustom

    const byPo = await erpGetList(
      "Sales Invoice",
      [
        ["po_no", "=", invoiceName],
        ["docstatus", "!=", 2],
      ],
      ["name", "docstatus"]
    )
    const fromPo = pickExistingName(byPo)
    if (fromPo) return fromPo
  }

  return null
}

async function listErpOdooLinks(): Promise<{
  moveIds: Set<string>
  invoiceNames: Set<string>
}> {
  const moveIds = new Set<string>()
  const invoiceNames = new Set<string>()
  let start = 0
  const page = 500

  for (;;) {
    const params = new URLSearchParams({
      fields: JSON.stringify([
        "name",
        "docstatus",
        "custom_odoo_move_id",
        "custom_odoo_invoice_name",
        "po_no",
      ]),
      filters: JSON.stringify([["docstatus", "!=", 2]]),
      limit_start: String(start),
      limit_page_length: String(page),
      order_by: "creation asc",
    })
    const body = await erpFetch(
      `/api/resource/${encodeURIComponent("Sales Invoice")}?${params}`
    )
    const rows = Array.isArray(body.data)
      ? (body.data as Array<Record<string, unknown>>)
      : []
    if (!rows.length) break

    for (const row of rows) {
      const moveId = String(row.custom_odoo_move_id || "").trim()
      if (moveId) moveIds.add(moveId)
      const customName = String(row.custom_odoo_invoice_name || "").trim()
      if (customName) invoiceNames.add(customName)
      const poNo = String(row.po_no || "").trim()
      if (poNo) invoiceNames.add(poNo)
    }

    start += rows.length
    if (rows.length < page) break
  }

  return { moveIds, invoiceNames }
}

async function ensureCustomer(invoice: OdooInvoice): Promise<string> {
  if (invoice.partnerId) {
    const byOdoo = await erpGetList(
      "Customer",
      [["custom_odoo_partner_id", "=", String(invoice.partnerId)]],
      ["name"]
    )
    const found = byOdoo[0]?.name
    if (typeof found === "string" && found) return found
  }

  const customerName = (invoice.partnerName || `Odoo Customer ${invoice.id}`).slice(
    0,
    120
  )
  const supply = placeOfSupply(invoice.placeOfSupply || invoice.partnerState)
  const created = await erpInsert("Customer", {
    doctype: "Customer",
    customer_name: customerName,
    customer_type: "Individual",
    customer_group: CUSTOMER_GROUP,
    territory: TERRITORY,
    gst_category: gstCategory(invoice.gstTreatment),
    ...(invoice.partnerId
      ? { custom_odoo_partner_id: String(invoice.partnerId) }
      : {}),
    ...(supply ? { place_of_supply: supply } : {}),
  })
  return String(created.name)
}

async function ensureGstHsn(hsn: string): Promise<void> {
  const code = hsn.trim()
  if (!code) return
  try {
    const existing = await erpGetList(
      "GST HSN Code",
      [["hsn_code", "=", code]],
      ["name"]
    )
    if (existing.length > 0) return
    await erpInsert("GST HSN Code", {
      doctype: "GST HSN Code",
      hsn_code: code,
      description: `Auto ${code}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/exists|duplicate/i.test(message)) {
      logger.warn("Could not ensure GST HSN Code", { hsn: code, error: message })
    }
  }
}

async function resolveItemCode(
  productId: number | null,
  barcode: string | null,
  label: string
): Promise<string> {
  if (productId) {
    const byCustom = await erpGetList(
      "Item",
      [["custom_odoo_product_id", "=", String(productId)]],
      ["name"]
    )
    if (typeof byCustom[0]?.name === "string" && byCustom[0].name) {
      return String(byCustom[0].name)
    }

    const code = `ODOO-V-${productId}`
    const byName = await erpGetList("Item", [["name", "=", code]], ["name"])
    if (typeof byName[0]?.name === "string" && byName[0].name) {
      return String(byName[0].name)
    }
  }

  if (barcode?.trim()) {
    try {
      const barcodeRows = await erpGetList(
        "Item Barcode",
        [["barcode", "=", barcode.trim()]],
        ["parent"]
      )
      if (typeof barcodeRows[0]?.parent === "string" && barcodeRows[0].parent) {
        return String(barcodeRows[0].parent)
      }
    } catch {
      // website-sync role may lack Item Barcode read; continue with Odoo id
    }
  }

  if (productId) {
    const code = `ODOO-V-${productId}`
    const hsn = "61091000"
    try {
      await ensureGstHsn(hsn)
      const created = await erpInsert("Item", {
        doctype: "Item",
        item_code: code,
        item_name: (label || code).slice(0, 140),
        item_group: "Products",
        stock_uom: "Nos",
        is_stock_item: 1,
        include_item_in_manufacturing: 0,
        valuation_rate: 1,
        gst_hsn_code: hsn,
        custom_odoo_product_id: String(productId),
      })
      return String(created.name || code)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/exists|duplicate/i.test(message)) return code
      // Item may have been created concurrently; re-check before failing hard.
      const retry = await erpGetList("Item", [["name", "=", code]], ["name"])
      if (typeof retry[0]?.name === "string" && retry[0].name) {
        return String(retry[0].name)
      }
      throw new Error(
        `No ERPNext item for Odoo product ${productId} (${label}): ${message}`
      )
    }
  }

  throw new Error(
    `No ERPNext item for Odoo product ${productId || "?"} / barcode ${
      barcode || "missing"
    } (${label})`
  )
}

async function submitDocument(
  doctype: string,
  name: string
): Promise<Record<string, unknown>> {
  let doc = await erpGet(doctype, name)
  if (Number(doc.docstatus) === 1) return doc
  doc = await erpGet(doctype, name)
  return erpSubmit(doc)
}

function odooLooksPaid(invoice: OdooInvoice): boolean {
  const state = (invoice.paymentState || "").toLowerCase()
  if (state === "paid" || state === "in_payment") return true
  if (Number(invoice.amountResidual) <= 0.05 && state !== "not_paid") {
    return true
  }
  return Number(invoice.amountResidual) <= 0.05 && invoice.payments.length > 0
}

async function ensurePayment(
  invoice: OdooInvoice,
  customer: string,
  salesInvoice: string,
  payments: OdooPaymentInfo[]
): Promise<boolean> {
  const doc = await erpGet("Sales Invoice", salesInvoice)
  let outstanding = Number(doc.outstanding_amount || 0)
  if (outstanding <= 0.05) return false

  // Credit-note / reversed clear residual without a customer receipt — skip.
  if ((invoice.paymentState || "").toLowerCase() === "reversed") {
    return false
  }

  const entries =
    payments.length > 0
      ? payments
      : odooLooksPaid(invoice)
        ? [
            {
              journalName: "Cash",
              amount: outstanding,
              paymentDate: invoice.date,
            },
          ]
        : []

  if (entries.length === 0) return false

  let updated = false
  for (const payment of entries) {
    if (outstanding <= 0.05) break
    const amount = Math.min(Number(payment.amount) || outstanding, outstanding)
    if (amount <= 0.05) continue
    const account = mapJournalToMode(payment.journalName)
    const created = await erpInsert("Payment Entry", {
      doctype: "Payment Entry",
      payment_type: "Receive",
      party_type: "Customer",
      party: customer,
      company: COMPANY,
      mode_of_payment: account.mode,
      paid_from: RECEIVABLE,
      paid_to: account.account,
      paid_amount: amount,
      received_amount: amount,
      target_exchange_rate: 1,
      source_exchange_rate: 1,
      reference_no: invoice.name.slice(0, 140),
      reference_date: payment.paymentDate || invoice.date,
      references: [
        {
          reference_doctype: "Sales Invoice",
          reference_name: salesInvoice,
          allocated_amount: amount,
        },
      ],
    })
    await submitDocument("Payment Entry", String(created.name))
    updated = true
    outstanding = Number(
      ((await erpGet("Sales Invoice", salesInvoice)).outstanding_amount || 0)
    )
  }
  return updated
}

async function createErpInvoice(invoice: OdooInvoice): Promise<string> {
  if (invoice.lines.length === 0) {
    throw new Error("Invoice has no product lines")
  }

  const supply = placeOfSupply(invoice.placeOfSupply || invoice.partnerState)
  const gst = await loadGstTaxes(supply)
  const customer = await ensureCustomer(invoice)

  const items: Array<{
    item_code: string
    qty: number
    rate: number
    price_list_rate: number
    discount_percentage: number
    warehouse: string
    cost_center: string
    allow_zero_valuation_rate: number
  }> = []
  for (const line of invoice.lines) {
    const itemCode = await resolveItemCode(
      line.productId,
      line.barcode,
      line.name
    )
    const qty = Number(line.quantity)
    if (qty <= 0) continue
    const netRate = Number((line.priceSubtotal / qty).toFixed(6))
    const discount = Number(line.discount) || 0
    const priceListRate =
      discount > 0 && discount < 100
        ? Number((netRate / (1 - discount / 100)).toFixed(6))
        : netRate

    items.push({
      item_code: itemCode,
      qty,
      rate: netRate,
      price_list_rate: priceListRate,
      discount_percentage: discount,
      warehouse: WAREHOUSE,
      cost_center: COST_CENTER,
      allow_zero_valuation_rate: 1,
    })
  }

  if (items.length === 0) {
    throw new Error("Invoice has no sellable product lines")
  }

  const postingDate = invoice.date || new Date().toISOString().slice(0, 10)

  const created = await erpInsert("Sales Invoice", {
    doctype: "Sales Invoice",
    naming_series: INVOICE_SERIES,
    customer,
    company: COMPANY,
    posting_date: postingDate,
    due_date: postingDate,
    set_posting_time: 1,
    currency: "INR",
    selling_price_list: PRICE_LIST,
    set_warehouse: WAREHOUSE,
    update_stock: 1,
    po_no: invoice.name.slice(0, 140),
    company_gstin: COMPANY_GSTIN,
    gst_category: gstCategory(invoice.gstTreatment),
    taxes_and_charges: gst.template,
    taxes: gst.taxes,
    custom_odoo_move_id: String(invoice.id),
    custom_odoo_invoice_name: invoice.name,
    ...(supply ? { place_of_supply: supply } : {}),
    items,
  })

  const name = String(created.name)

  // Re-apply discount fields if hooks cleared them, then submit.
  let doc = await erpGet("Sales Invoice", name)
  const effectivePosting = String(doc.posting_date || postingDate).slice(0, 10)
  const patch: Record<string, unknown> = {
    due_date: effectivePosting,
    taxes: gst.taxes,
    taxes_and_charges: gst.template,
  }
  if (Array.isArray(doc.items)) {
    patch.items = (doc.items as Array<Record<string, unknown>>).map(
      (row, index) => {
        const source = items[index]
        if (!source) return row
        return {
          ...row,
          rate: source.rate,
          price_list_rate: source.price_list_rate,
          discount_percentage: source.discount_percentage,
        }
      }
    )
  }
  doc = await erpUpdate("Sales Invoice", name, patch)

  await submitDocument("Sales Invoice", name)
  try {
    await ensurePayment(invoice, customer, name, invoice.payments)
  } catch (error) {
    // Invoice is already submitted; payment catch-up on later crons will retry.
    const message = error instanceof Error ? error.message : String(error)
    logger.error("Odoo→ERPNext payment create failed after invoice submit", {
      moveId: invoice.id,
      odoo: invoice.name,
      erpnext: name,
      error: message,
    })
  }
  return name
}

export async function syncOdooInvoicesToErpNext(
  limit = 20
): Promise<OdooErpNextSyncResult> {
  if (!isOdooConfigured()) {
    return {
      checked: 0,
      created: 0,
      skipped: 0,
      paymentsUpdated: 0,
      failed: 0,
      errors: [{ invoice: "-", error: "Odoo is not configured" }],
    }
  }
  if (!isErpNextConfigured()) {
    return {
      checked: 0,
      created: 0,
      skipped: 0,
      paymentsUpdated: 0,
      failed: 0,
      errors: [{ invoice: "-", error: "ERPNext is not configured" }],
    }
  }

  const result: OdooErpNextSyncResult = {
    checked: 0,
    created: 0,
    skipped: 0,
    paymentsUpdated: 0,
    failed: 0,
    errors: [],
  }

  const watermark = await ensureCursor()
  const invoices = await fetchPostedInvoicesAfter(
    watermark,
    Math.min(Math.max(limit, 1), 50)
  )
  result.checked = invoices.length

  for (const invoice of invoices) {
    try {
      const existing = await findExistingInvoice(invoice.id, invoice.name)
      if (existing) {
        try {
          const customer = String(
            (await erpGet("Sales Invoice", existing)).customer || ""
          )
          if (
            customer &&
            (await ensurePayment(
              invoice,
              customer,
              existing,
              invoice.payments
            ))
          ) {
            result.paymentsUpdated += 1
          }
        } catch (paymentError) {
          const message =
            paymentError instanceof Error
              ? paymentError.message
              : "Payment retry failed"
          result.errors.push({
            invoice: invoice.name,
            error: `payment: ${message}`,
          })
          logger.error("Odoo→ERPNext payment retry failed", {
            moveId: invoice.id,
            name: invoice.name,
            erpnext: existing,
            error: message,
          })
        }
        await setCursor(invoice.id)
        result.skipped += 1
        continue
      }

      const name = await createErpInvoice(invoice)
      await setCursor(invoice.id)
      result.created += 1
      logger.info("Odoo invoice synced to ERPNext", {
        moveId: invoice.id,
        odoo: invoice.name,
        erpnext: name,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed"
      result.failed += 1
      result.errors.push({ invoice: invoice.name, error: message })
      logger.error("Odoo→ERPNext invoice sync failed", {
        moveId: invoice.id,
        name: invoice.name,
        error: message,
      })
      break
    }
  }

  // Catch up payments on older invoices that were created before Odoo payment
  // existed, or where Payment Entry create failed once.
  const paymentCatchup = await syncOutstandingOdooPayments(
    Math.min(Math.max(limit, 1), 50)
  )
  result.paymentsUpdated += paymentCatchup.paymentsUpdated
  result.failed += paymentCatchup.failed
  result.errors.push(...paymentCatchup.errors)

  return result
}

/**
 * Retry Payment Entries for submitted Odoo-linked invoices that still have
 * outstanding amount while Odoo shows them paid / reconciled.
 */
export async function syncOutstandingOdooPayments(
  limit = 50
): Promise<Pick<OdooErpNextSyncResult, "paymentsUpdated" | "failed" | "errors" | "checked">> {
  const empty = {
    checked: 0,
    paymentsUpdated: 0,
    failed: 0,
    errors: [] as Array<{ invoice: string; error: string }>,
  }
  if (!isOdooConfigured() || !isErpNextConfigured()) return empty

  const unpaid = await erpGetList(
    "Sales Invoice",
    [
      ["custom_odoo_move_id", "!=", ""],
      ["docstatus", "=", 1],
      ["is_return", "=", 0],
      ["outstanding_amount", ">", 0.5],
    ],
    ["name", "customer", "custom_odoo_move_id", "outstanding_amount"]
  )

  const rows = unpaid
    .map((row) => ({
      name: String(row.name || ""),
      customer: String(row.customer || ""),
      moveId: Number(row.custom_odoo_move_id),
    }))
    .filter((row) => row.name && row.customer && Number.isFinite(row.moveId))
    .slice(0, Math.min(Math.max(limit, 1), 100))

  empty.checked = rows.length
  if (rows.length === 0) return empty

  const invoices = await fetchPostedInvoicesByIds(rows.map((row) => row.moveId))
  const byMoveId = new Map(invoices.map((inv) => [inv.id, inv]))

  for (const row of rows) {
    const invoice = byMoveId.get(row.moveId)
    if (!invoice) continue
    if (!odooLooksPaid(invoice) && invoice.payments.length === 0) continue
    if ((invoice.paymentState || "").toLowerCase() === "reversed") continue

    try {
      if (
        await ensurePayment(invoice, row.customer, row.name, invoice.payments)
      ) {
        empty.paymentsUpdated += 1
        logger.info("Odoo payment backfilled on ERPNext invoice", {
          moveId: invoice.id,
          odoo: invoice.name,
          erpnext: row.name,
        })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment sync failed"
      empty.failed += 1
      empty.errors.push({ invoice: invoice.name, error: `payment: ${message}` })
      logger.error("Odoo→ERPNext outstanding payment sync failed", {
        moveId: invoice.id,
        name: invoice.name,
        erpnext: row.name,
        error: message,
      })
    }
  }

  return empty
}

/**
 * One-shot backfill: create ERPNext invoices for posted Odoo invoices that are
 * not already linked (by move id, custom invoice name, or po_no). Does not
 * change the cron watermark except to raise it to the latest Odoo id when done.
 */
export async function backfillMissingOdooInvoicesToErpNext(): Promise<
  OdooErpNextSyncResult & {
    missing: number
    missingAmountTotal: number
    createdAmountTotal: number
  }
> {
  if (!isOdooConfigured() || !isErpNextConfigured()) {
    return {
      checked: 0,
      created: 0,
      skipped: 0,
      paymentsUpdated: 0,
      failed: 0,
      missing: 0,
      missingAmountTotal: 0,
      createdAmountTotal: 0,
      errors: [
        {
          invoice: "-",
          error: !isOdooConfigured()
            ? "Odoo is not configured"
            : "ERPNext is not configured",
        },
      ],
    }
  }

  const refs = await listPostedInvoiceRefs()
  const links = await listErpOdooLinks()
  const missingRefs = refs.filter((ref) => {
    if (links.moveIds.has(String(ref.id))) return false
    if (links.invoiceNames.has(ref.name)) return false
    return true
  })

  const result = {
    checked: refs.length,
    created: 0,
    skipped: refs.length - missingRefs.length,
    paymentsUpdated: 0,
    failed: 0,
    missing: missingRefs.length,
    missingAmountTotal: Number(
      missingRefs.reduce((sum, ref) => sum + ref.amountTotal, 0).toFixed(2)
    ),
    createdAmountTotal: 0,
    errors: [] as Array<{ invoice: string; error: string }>,
  }

  logger.info("Odoo→ERPNext backfill starting", {
    odooPosted: refs.length,
    alreadyLinked: result.skipped,
    missing: result.missing,
    missingAmountTotal: result.missingAmountTotal,
  })

  const batchSize = 10
  for (let i = 0; i < missingRefs.length; i += batchSize) {
    const chunk = missingRefs.slice(i, i + batchSize)
    const invoices = await fetchPostedInvoicesByIds(chunk.map((ref) => ref.id))
    const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]))

    for (const ref of chunk) {
      const invoice = byId.get(ref.id)
      if (!invoice) {
        result.failed += 1
        result.errors.push({
          invoice: ref.name,
          error: "Could not load posted invoice from Odoo",
        })
        continue
      }

      try {
        // Re-check immediately before insert to avoid duplicates under concurrency.
        const existing = await findExistingInvoice(invoice.id, invoice.name)
        if (existing) {
          result.skipped += 1
          result.missing -= 1
          continue
        }

        const name = await createErpInvoice(invoice)
        result.created += 1
        result.createdAmountTotal = Number(
          (result.createdAmountTotal + invoice.amountTotal).toFixed(2)
        )
        logger.info("Odoo invoice backfilled to ERPNext", {
          moveId: invoice.id,
          odoo: invoice.name,
          erpnext: name,
          amountTotal: invoice.amountTotal,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Backfill failed"
        result.failed += 1
        result.errors.push({ invoice: invoice.name, error: message })
        logger.error("Odoo→ERPNext backfill failed for invoice", {
          moveId: invoice.id,
          name: invoice.name,
          error: message,
        })
      }
    }
  }

  // Keep cron watermark at/above latest Odoo id so historical gap work is not re-queued.
  const maxId = await fetchMaxPostedInvoiceId()
  const current = await getCursor()
  if (current == null || current < maxId) {
    await setCursor(maxId)
  }

  return result
}
