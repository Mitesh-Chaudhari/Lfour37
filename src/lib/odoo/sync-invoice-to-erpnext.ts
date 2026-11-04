import { createAdminClient } from "@/lib/supabase/server"
import logger from "@/lib/logger"
import {
  erpCall,
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
  isOdooConfigured,
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

async function findExistingInvoice(moveId: number): Promise<string | null> {
  const rows = await erpGetList(
    "Sales Invoice",
    [
      ["custom_odoo_move_id", "=", String(moveId)],
      ["docstatus", "!=", 2],
    ],
    ["name", "docstatus"]
  )
  const submitted = rows.find((row) => Number(row.docstatus) === 1)
  const name = (submitted || rows[0])?.name
  return typeof name === "string" ? name : null
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
    const byBarcode = await erpGetList(
      "Item",
      [["barcode", "=", barcode.trim()]],
      ["name"]
    )
    if (typeof byBarcode[0]?.name === "string" && byBarcode[0].name) {
      return String(byBarcode[0].name)
    }

    const barcodeRows = await erpGetList(
      "Item Barcode",
      [["barcode", "=", barcode.trim()]],
      ["parent"]
    )
    if (typeof barcodeRows[0]?.parent === "string" && barcodeRows[0].parent) {
      return String(barcodeRows[0].parent)
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

async function ensurePayment(
  invoice: OdooInvoice,
  customer: string,
  salesInvoice: string,
  payments: OdooPaymentInfo[]
): Promise<void> {
  const doc = await erpGet("Sales Invoice", salesInvoice)
  let outstanding = Number(doc.outstanding_amount || 0)
  if (outstanding <= 0.05) return

  const entries =
    payments.length > 0
      ? payments
      : invoice.paymentState === "paid" || invoice.paymentState === "in_payment"
        ? [
            {
              journalName: "Cash",
              amount: outstanding,
              paymentDate: invoice.date,
            },
          ]
        : []

  if (entries.length === 0) return

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
    outstanding = Number(
      ((await erpGet("Sales Invoice", salesInvoice)).outstanding_amount || 0)
    )
  }
}

async function createErpInvoice(invoice: OdooInvoice): Promise<string> {
  if (invoice.lines.length === 0) {
    throw new Error("Invoice has no product lines")
  }

  const supply = placeOfSupply(invoice.placeOfSupply || invoice.partnerState)
  const gst = await loadGstTaxes(supply)
  const customer = await ensureCustomer(invoice)

  const items = []
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

  const created = await erpInsert("Sales Invoice", {
    doctype: "Sales Invoice",
    naming_series: INVOICE_SERIES,
    customer,
    company: COMPANY,
    posting_date: invoice.date,
    due_date: invoice.date,
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
  if (Array.isArray(doc.items)) {
    const patchedItems = (doc.items as Array<Record<string, unknown>>).map(
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
    doc = await erpUpdate("Sales Invoice", name, {
      items: patchedItems,
      taxes: gst.taxes,
      taxes_and_charges: gst.template,
    })
  }

  await submitDocument("Sales Invoice", name)
  await ensurePayment(invoice, customer, name, invoice.payments)
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
      failed: 0,
      errors: [{ invoice: "-", error: "Odoo is not configured" }],
    }
  }
  if (!isErpNextConfigured()) {
    return {
      checked: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [{ invoice: "-", error: "ERPNext is not configured" }],
    }
  }

  const result: OdooErpNextSyncResult = {
    checked: 0,
    created: 0,
    skipped: 0,
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
      const existing = await findExistingInvoice(invoice.id)
      if (existing) {
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

  return result
}
