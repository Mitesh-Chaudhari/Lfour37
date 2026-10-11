import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/server"
import logger from "@/lib/logger"
import {
  erpCancel,
  erpDelete,
  erpGet,
  erpGetList,
  erpInsert,
  erpMethod,
  erpSubmit,
  erpUpdate,
  isErpNextConfigured,
} from "@/lib/erpnext/client"

const COMPANY = "Yadevi Lifestyle Private Limited"
const WAREHOUSE = "Online - S"
const PRICE_LIST = "Website Selling"
const CUSTOMER_GROUP = "Website"
const TERRITORY = "India"
const RECEIVABLE = "Debtors - S"
const COST_CENTER = "Main - S"

const CONFIRMED_STATUSES = new Set([
  "processing",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
])

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
  "madhya pradesh": "23-Madhya Pradesh",
  gujarat: "24-Gujarat",
  "dadra and nagar haveli and daman and diu": "26-Dadra and Nagar Haveli and Daman and Diu",
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

type ShippingAddress = {
  full_name?: string
  phone?: string
  address_line1?: string
  address_line2?: string | null
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

type OrderItemRow = {
  variant_id: string | null
  quantity: number
  unit_price: number
  status?: string | null
}

type WebsiteOrder = {
  id: string
  order_number: string | null
  status: string
  payment_status: string | null
  payment_method: string | null
  subtotal: number | null
  discount_amount: number | null
  total: number | null
  created_at: string
  user_id: string
  shipping_address: ShippingAddress | null
  items: OrderItemRow[]
  user?: { email?: string | null; full_name?: string | null } | Array<{
    email?: string | null
    full_name?: string | null
  }> | null
}

type ResolvedLine = {
  variantId: string
  itemCode: string
  qty: number
  rate: number
}

export type ErpNextSyncResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  salesOrder?: string | null
}

function istDate(value: string, plusDays = 0): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }
  date.setUTCDate(date.getUTCDate() + plusDays)
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

function placeOfSupply(state: string | undefined): string | null {
  if (!state) return null
  const trimmed = state.trim()
  if (/^\d{2}-/.test(trimmed)) return trimmed
  return GST_STATE_BY_NAME[trimmed.toLowerCase()] || null
}

function paymentAccount(method: string | null): { mode: string; account: string } {
  switch ((method || "").toLowerCase()) {
    case "stripe":
      return { mode: "Stripe", account: "Online Payments - S" }
    case "crypto":
      return { mode: "Crypto", account: "Online Payments - S" }
    case "cod":
      return { mode: "Cash", account: "Cash - S" }
    default:
      return { mode: "Razorpay", account: "Online Payments - S" }
  }
}

function userOf(order: WebsiteOrder): { email?: string | null; full_name?: string | null } {
  if (Array.isArray(order.user)) return order.user[0] || {}
  return order.user || {}
}

function activeItems(order: WebsiteOrder): OrderItemRow[] {
  return (order.items || []).filter((item) => item.status !== "cancelled" && item.variant_id)
}

function shouldInvoice(order: WebsiteOrder): boolean {
  if (order.payment_status === "completed") return true
  return Boolean(order.payment_method && order.payment_method !== "cod")
}

function shouldDeliver(order: WebsiteOrder): boolean {
  return order.status === "shipped" || order.status === "delivered"
}

function stripNewDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...doc }
  for (const key of [
    "name",
    "creation",
    "modified",
    "owner",
    "modified_by",
    "docstatus",
    "idx",
    "amended_from",
  ]) {
    delete copy[key]
  }

  for (const [key, value] of Object.entries(copy)) {
    if (!Array.isArray(value)) continue
    copy[key] = value.map((row) => {
      if (!row || typeof row !== "object") return row
      const child = { ...(row as Record<string, unknown>) }
      delete child.name
      delete child.parent
      delete child.parentfield
      delete child.parenttype
      delete child.idx
      delete child.creation
      delete child.modified
      delete child.owner
      delete child.modified_by
      delete child.docstatus
      return child
    })
  }

  return copy
}

function includeTaxesInRate(doc: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(doc.taxes)) return doc
  return {
    ...doc,
    taxes: doc.taxes.map((row) => {
      if (!row || typeof row !== "object") return row
      return { ...(row as Record<string, unknown>), included_in_print_rate: 1 }
    }),
  }
}

async function findOpen(doctype: string, orderId: string): Promise<string | null> {
  const rows = await erpGetList(
    doctype,
    [
      ["custom_supabase_order_id", "=", orderId],
      ["docstatus", "!=", 2],
    ],
    ["name", "docstatus"]
  )
  const submitted = rows.find((row) => Number(row.docstatus) === 1)
  const name = (submitted || rows[0])?.name
  return typeof name === "string" ? name : null
}

async function cancelOpen(doctype: string, orderId: string): Promise<void> {
  const rows = await erpGetList(
    doctype,
    [
      ["custom_supabase_order_id", "=", orderId],
      ["docstatus", "!=", 2],
    ],
    ["name", "docstatus"]
  )

  for (const row of rows) {
    const name = String(row.name || "")
    if (!name) continue
    if (Number(row.docstatus) === 1) {
      await erpCancel(doctype, name)
    } else if (Number(row.docstatus) === 0) {
      await erpDelete(doctype, name)
    }
  }
}

async function cancelErpDocuments(orderId: string): Promise<void> {
  for (const doctype of ["Payment Entry", "Sales Invoice", "Delivery Note", "Sales Order"]) {
    await cancelOpen(doctype, orderId)
  }
}

async function loadOrder(admin: SupabaseClient, orderId: string): Promise<WebsiteOrder | null> {
  const { data, error } = await admin
    .from("orders")
    .select("*, items:order_items(*), user:users(email, full_name)")
    .eq("id", orderId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as WebsiteOrder | null) || null
}

async function saveLink(
  admin: SupabaseClient,
  orderId: string,
  patch: Record<string, string | null>
): Promise<void> {
  const { error } = await admin.from("orders").update(patch).eq("id", orderId)
  if (error) {
    logger.error("Could not store ERPNext ids on the order", { error, orderId })
  }
}

async function resolveLines(items: OrderItemRow[]): Promise<ResolvedLine[]> {
  const variantIds = [...new Set(items.map((item) => item.variant_id).filter(Boolean))] as string[]
  const rows = await erpGetList(
    "Item",
    [["custom_supabase_variant_id", "in", variantIds]],
    ["name", "custom_supabase_variant_id"]
  )
  const byVariant = new Map<string, string>()
  for (const row of rows) {
    const variantId = String(row.custom_supabase_variant_id || "")
    const itemCode = String(row.name || "")
    if (variantId && itemCode) byVariant.set(variantId, itemCode)
  }

  const lines: ResolvedLine[] = []
  for (const item of items) {
    const itemCode = item.variant_id ? byVariant.get(item.variant_id) : undefined
    if (!itemCode) {
      throw new Error(`No ERPNext item for variant ${item.variant_id}`)
    }
    lines.push({
      variantId: item.variant_id as string,
      itemCode,
      qty: Number(item.quantity),
      rate: Number(item.unit_price),
    })
  }
  return lines
}

async function ensureCustomer(order: WebsiteOrder): Promise<string> {
  const existing = await erpGetList(
    "Customer",
    [["custom_supabase_user_id", "=", order.user_id]],
    ["name"]
  )
  const found = existing[0]?.name
  if (typeof found === "string" && found) return found

  const user = userOf(order)
  const address = order.shipping_address
  const baseName = address?.full_name || user.full_name || user.email || "Website Customer"
  const customerName = `${baseName}`.slice(0, 120)

  const payload = {
    doctype: "Customer",
    customer_name: customerName,
    customer_type: "Individual",
    customer_group: CUSTOMER_GROUP,
    territory: TERRITORY,
    gst_category: "Unregistered",
    custom_supabase_user_id: order.user_id,
  }

  try {
    const created = await erpInsert("Customer", payload)
    return String(created.name)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (!/duplicate|already exists/i.test(message)) throw error
    const created = await erpInsert("Customer", {
      ...payload,
      customer_name: `${customerName} ${order.user_id.slice(0, 8)}`.slice(0, 140),
    })
    return String(created.name)
  }
}

async function ensureAddress(order: WebsiteOrder, customer: string): Promise<string | null> {
  const address = order.shipping_address
  if (!address?.address_line1 || !address.city) return null

  const title = `${order.order_number || order.id}`.slice(0, 100)
  const existing = await erpGetList(
    "Address",
    [
      ["address_title", "=", title],
      ["address_type", "=", "Shipping"],
    ],
    ["name"]
  )
  const found = existing[0]?.name
  if (typeof found === "string" && found) return found

  const created = await erpInsert("Address", {
    doctype: "Address",
    address_title: title,
    address_type: "Shipping",
    address_line1: address.address_line1,
    address_line2: address.address_line2 || "",
    city: address.city,
    state: address.state || "",
    pincode: address.postal_code || "",
    country: address.country && address.country.length > 2 ? address.country : "India",
    phone: address.phone || "",
    email_id: userOf(order).email || "",
    links: [{ link_doctype: "Customer", link_name: customer }],
  })

  return String(created.name || "") || null
}

async function submitDocument(
  doctype: string,
  name: string,
  patch?: Record<string, unknown>
): Promise<void> {
  let doc = await erpGet(doctype, name)
  if (Number(doc.docstatus) === 1) return
  if (patch) {
    doc = await erpUpdate(doctype, name, patch)
  }
  const withTaxes = includeTaxesInRate(doc)
  if (withTaxes !== doc) {
    doc = await erpUpdate(doctype, name, { taxes: withTaxes.taxes })
  }
  doc = await erpGet(doctype, name)
  await erpSubmit(doc)
}

async function salesOrderMatches(name: string, lines: ResolvedLine[]): Promise<boolean> {
  const doc = await erpGet("Sales Order", name)
  const items = Array.isArray(doc.items) ? doc.items : []
  const current = new Map<string, number>()
  for (const row of items) {
    if (!row || typeof row !== "object") continue
    const item = row as Record<string, unknown>
    const code = String(item.item_code || "")
    current.set(code, (current.get(code) || 0) + Number(item.qty || 0))
  }
  if (current.size !== lines.length) return false
  return lines.every((line) => current.get(line.itemCode) === line.qty)
}

async function ensureSalesOrder(
  order: WebsiteOrder,
  customer: string,
  lines: ResolvedLine[]
): Promise<string> {
  const existing = await findOpen("Sales Order", order.id)
  if (existing) {
    if (await salesOrderMatches(existing, lines)) {
      await submitDocument("Sales Order", existing)
      return existing
    }
    await cancelErpDocuments(order.id)
  }

  const subtotal = Number(order.subtotal) || lines.reduce((sum, line) => sum + line.rate * line.qty, 0)
  const discount = Math.min(Number(order.discount_amount) || 0, subtotal)
  const discountPercentage = subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(6)) : 0
  const postingDate = istDate(order.created_at)
  const deliveryDate = istDate(order.created_at, 3)
  let addressName: string | null = null
  try {
    addressName = await ensureAddress(order, customer)
  } catch (error) {
    logger.warn("ERPNext shipping address was not created", {
      error: error instanceof Error ? error.message : error,
      orderId: order.id,
    })
  }
  const supply = placeOfSupply(order.shipping_address?.state)

  const created = await erpInsert("Sales Order", {
    doctype: "Sales Order",
    customer,
    company: COMPANY,
    transaction_date: postingDate,
    delivery_date: deliveryDate,
    currency: "INR",
    selling_price_list: PRICE_LIST,
    set_warehouse: WAREHOUSE,
    po_no: (order.order_number || order.id).slice(0, 140),
    custom_supabase_order_id: order.id,
    gst_category: "Unregistered",
    ...(supply ? { place_of_supply: supply } : {}),
    ...(addressName
      ? { customer_address: addressName, shipping_address_name: addressName }
      : {}),
    ...(discountPercentage > 0
      ? {
          apply_discount_on: "Net Total",
          additional_discount_percentage: discountPercentage,
        }
      : {}),
    items: lines.map((line) => ({
      item_code: line.itemCode,
      qty: line.qty,
      rate: line.rate,
      warehouse: WAREHOUSE,
      cost_center: COST_CENTER,
      delivery_date: deliveryDate,
    })),
  })

  const name = String(created.name)
  await submitDocument("Sales Order", name)
  return name
}

async function ensureMappedDoc(
  doctype: "Delivery Note" | "Sales Invoice",
  method: string,
  salesOrder: string,
  orderId: string,
  extra?: Record<string, unknown>
): Promise<string> {
  const existing = await findOpen(doctype, orderId)
  if (existing) {
    await submitDocument(doctype, existing)
    return existing
  }

  const mapped = stripNewDoc(
    await erpMethod(method, { source_name: salesOrder })
  )
  const created = await erpInsert(doctype, {
    ...mapped,
    ...extra,
    custom_supabase_order_id: orderId,
    set_warehouse: WAREHOUSE,
    update_stock: doctype === "Sales Invoice" ? 0 : mapped.update_stock,
  })
  const name = String(created.name)
  await submitDocument(doctype, name)
  return name
}

async function ensurePayment(
  order: WebsiteOrder,
  customer: string,
  salesInvoice: string
): Promise<string> {
  const existing = await findOpen("Payment Entry", order.id)
  if (existing) {
    await submitDocument("Payment Entry", existing)
    return existing
  }

  const invoice = await erpGet("Sales Invoice", salesInvoice)
  const amount = Number(invoice.outstanding_amount ?? invoice.grand_total ?? order.total ?? 0)
  if (amount <= 0) {
    throw new Error("Sales Invoice has nothing left to receive")
  }

  const account = paymentAccount(order.payment_method)
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
    reference_no: (order.order_number || order.id).slice(0, 140),
    reference_date: istDate(order.created_at),
    custom_supabase_order_id: order.id,
    references: [
      {
        reference_doctype: "Sales Invoice",
        reference_name: salesInvoice,
        allocated_amount: amount,
      },
    ],
  })

  const name = String(created.name)
  await submitDocument("Payment Entry", name)
  return name
}

export async function syncWebsiteOrderToErpNext(orderId: string): Promise<ErpNextSyncResult> {
  if (!isErpNextConfigured()) {
    return { ok: false, skipped: true, error: "ERPNext is not configured" }
  }

  const admin = createAdminClient()

  try {
    const order = await loadOrder(admin, orderId)
    if (!order) return { ok: false, error: "Order not found" }
    if (!CONFIRMED_STATUSES.has(order.status)) {
      return { ok: true, skipped: true }
    }

    if (order.status === "cancelled" || order.status === "refunded") {
      await cancelErpDocuments(order.id)
      await saveLink(admin, order.id, {
        erpnext_sync_error: null,
        erpnext_synced_at: new Date().toISOString(),
      })
      return { ok: true }
    }

    const items = activeItems(order)
    if (items.length === 0) {
      await cancelErpDocuments(order.id)
      await saveLink(admin, order.id, {
        erpnext_sync_error: null,
        erpnext_synced_at: new Date().toISOString(),
      })
      return { ok: true }
    }

    const lines = await resolveLines(items)
    const customer = await ensureCustomer(order)
    const salesOrder = await ensureSalesOrder(order, customer, lines)

    let deliveryNote: string | null = null
    let salesInvoice: string | null = null
    let paymentEntry: string | null = null
    let syncError: string | null = null

    if (shouldDeliver(order)) {
      try {
        deliveryNote = await ensureMappedDoc(
          "Delivery Note",
          "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note",
          salesOrder,
          order.id
        )
      } catch (error) {
        syncError = error instanceof Error ? error.message : "Delivery Note failed"
      }
    }

    if (shouldInvoice(order)) {
      try {
        salesInvoice = await ensureMappedDoc(
          "Sales Invoice",
          "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
          salesOrder,
          order.id,
          { update_stock: 0 }
        )
        paymentEntry = await ensurePayment(order, customer, salesInvoice)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invoice or payment failed"
        syncError = syncError ? `${syncError}; ${message}` : message
      }
    }

    await saveLink(admin, order.id, {
      erpnext_customer: customer,
      erpnext_sales_order: salesOrder,
      erpnext_delivery_note: deliveryNote,
      erpnext_sales_invoice: salesInvoice,
      erpnext_payment_entry: paymentEntry,
      erpnext_sync_error: syncError,
      erpnext_synced_at: new Date().toISOString(),
    })

    if (syncError) {
      logger.error("ERPNext order sync saved the sales order with a follow-up error", {
        orderId: order.id,
        salesOrder,
        syncError,
      })
      return { ok: false, error: syncError, salesOrder }
    }

    logger.info("ERPNext order synced", { orderId: order.id, salesOrder })
    return { ok: true, salesOrder }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERPNext sync failed"
    logger.error("ERPNext order sync failed", { error: message, orderId })
    await saveLink(admin, orderId, {
      erpnext_sync_error: message,
      erpnext_synced_at: new Date().toISOString(),
    })
    return { ok: false, error: message }
  }
}

export async function syncRecentOrdersToErpNext(limit = 20): Promise<{
  checked: number
  synced: number
  failed: number
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("orders")
    .select(
      "id, status, payment_status, erpnext_sales_order, erpnext_delivery_note, erpnext_payment_entry, erpnext_sync_error"
    )
    .in("status", [...CONFIRMED_STATUSES])
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)

  const pending = (data || [])
    .filter((order) => {
      if (!order.erpnext_sales_order || order.erpnext_sync_error) return true
      if (
        (order.status === "shipped" || order.status === "delivered") &&
        !order.erpnext_delivery_note
      ) {
        return true
      }
      if (
        order.payment_status === "completed" &&
        !order.erpnext_payment_entry &&
        order.status !== "cancelled" &&
        order.status !== "refunded"
      ) {
        return true
      }
      return false
    })
    .slice(0, limit)

  let synced = 0
  let failed = 0
  for (const order of pending) {
    const result = await syncWebsiteOrderToErpNext(order.id)
    if (result.ok) synced += 1
    else if (!result.skipped) failed += 1
  }

  return { checked: pending.length, synced, failed }
}

/** Push a confirmed website order into ERPNext without failing checkout. */
export async function queueErpNextOrderSync(orderId: string): Promise<void> {
  try {
    await syncWebsiteOrderToErpNext(orderId)
  } catch (error) {
    logger.error("ERPNext order sync failed", { error, orderId })
  }
}
