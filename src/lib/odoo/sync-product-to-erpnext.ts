import { createAdminClient } from "@/lib/supabase/server"
import logger from "@/lib/logger"
import {
  erpGetList,
  erpInsert,
  erpUpdate,
  isErpNextConfigured,
} from "@/lib/erpnext/client"
import {
  fetchMaxProductId,
  fetchProductsAfter,
  isOdooConfigured,
  type OdooProduct,
} from "@/lib/odoo/client"

const CURSOR_KEY = "odoo_erpnext_last_product_id"
const DEFAULT_HSN = "61091000"

export type OdooProductSyncResult = {
  checked: number
  created: number
  linked: number
  skipped: number
  failed: number
  errors: Array<{ product: string; error: string }>
}

function itemCodeFor(productId: number): string {
  return `ODOO-V-${productId}`
}

function inferHsn(label: string): string {
  const text = label.toLowerCase()
  if (/jean|pant|trouser|chino|cargo/.test(text)) return "62034300"
  if (/shirt|kurta|top/.test(text)) return "62052000"
  return DEFAULT_HSN
}

async function getCursor(): Promise<number | null> {
  const admin = createAdminClient()
  const envFloor = Number(process.env.ODOO_ERPNEXT_SYNC_AFTER_PRODUCT_ID || "")
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

async function setCursor(productId: number): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("sync_cursors").upsert(
    {
      key: CURSOR_KEY,
      value: String(productId),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  )
  if (error) throw new Error(error.message)
}

async function ensureCursor(): Promise<number> {
  const existing = await getCursor()
  if (existing != null) return existing

  const envFloor = Number(process.env.ODOO_ERPNEXT_SYNC_AFTER_PRODUCT_ID || "")
  if (Number.isFinite(envFloor) && envFloor > 0) {
    await setCursor(envFloor)
    return envFloor
  }

  // First run: watermark at current max so only *new* Odoo products sync.
  const maxId = await fetchMaxProductId()
  await setCursor(maxId)
  logger.info("Odoo→ERPNext product sync watermark initialized", { maxId })
  return maxId
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
      logger.warn("Could not ensure GST HSN Code for product sync", {
        hsn: code,
        error: message,
      })
    }
  }
}

async function findExistingItem(
  product: OdooProduct
): Promise<{ name: string; reason: string } | null> {
  const byCustom = await erpGetList(
    "Item",
    [["custom_odoo_product_id", "=", String(product.id)]],
    ["name", "custom_odoo_product_id"]
  )
  if (typeof byCustom[0]?.name === "string" && byCustom[0].name) {
    return { name: String(byCustom[0].name), reason: "custom_odoo_product_id" }
  }

  const code = itemCodeFor(product.id)
  const byCode = await erpGetList("Item", [["name", "=", code]], ["name"])
  if (typeof byCode[0]?.name === "string" && byCode[0].name) {
    return { name: String(byCode[0].name), reason: "item_code" }
  }

  if (product.barcode?.trim()) {
    try {
      const barcodeRows = await erpGetList(
        "Item Barcode",
        [["barcode", "=", product.barcode.trim()]],
        ["parent"]
      )
      if (typeof barcodeRows[0]?.parent === "string" && barcodeRows[0].parent) {
        return {
          name: String(barcodeRows[0].parent),
          reason: "barcode",
        }
      }
    } catch {
      // Item Barcode read may be restricted; fall through to create path.
    }

    // Some sites store barcode on Item.barcode as well.
    try {
      const byItemBarcode = await erpGetList(
        "Item",
        [["barcode", "=", product.barcode.trim()]],
        ["name"]
      )
      if (
        typeof byItemBarcode[0]?.name === "string" &&
        byItemBarcode[0].name
      ) {
        return {
          name: String(byItemBarcode[0].name),
          reason: "item.barcode",
        }
      }
    } catch {
      // ignore
    }
  }

  return null
}

async function linkOdooIdIfMissing(
  itemName: string,
  productId: number
): Promise<boolean> {
  const rows = await erpGetList(
    "Item",
    [["name", "=", itemName]],
    ["name", "custom_odoo_product_id"]
  )
  const current = String(rows[0]?.custom_odoo_product_id || "").trim()
  if (current) {
    // Already linked to this or another Odoo product — never overwrite.
    return false
  }
  await erpUpdate("Item", itemName, {
    custom_odoo_product_id: String(productId),
  })
  return true
}

async function createItem(product: OdooProduct): Promise<string> {
  const code = itemCodeFor(product.id)
  const label = (product.displayName || code).slice(0, 140)
  const hsn = inferHsn(label)
  await ensureGstHsn(hsn)

  const doc: Record<string, unknown> = {
    doctype: "Item",
    item_code: code,
    item_name: label,
    item_group: "Products",
    stock_uom: "Nos",
    is_stock_item: 1,
    include_item_in_manufacturing: 0,
    valuation_rate: 1,
    gst_hsn_code: hsn,
    custom_odoo_product_id: String(product.id),
  }

  if (product.barcode?.trim()) {
    doc.barcodes = [
      {
        barcode: product.barcode.trim(),
        barcode_type: "",
      },
    ]
  }

  const created = await erpInsert("Item", doc)
  return String(created.name || code)
}

/**
 * Poll new Odoo products and create ERPNext Items without duplicates.
 * Dedup keys: custom_odoo_product_id, ODOO-V-{id}, barcode.
 */
export async function syncOdooProductsToErpNext(
  limit = 50
): Promise<OdooProductSyncResult> {
  if (!isOdooConfigured()) {
    return {
      checked: 0,
      created: 0,
      linked: 0,
      skipped: 0,
      failed: 0,
      errors: [{ product: "-", error: "Odoo is not configured" }],
    }
  }
  if (!isErpNextConfigured()) {
    return {
      checked: 0,
      created: 0,
      linked: 0,
      skipped: 0,
      failed: 0,
      errors: [{ product: "-", error: "ERPNext is not configured" }],
    }
  }

  const result: OdooProductSyncResult = {
    checked: 0,
    created: 0,
    linked: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const watermark = await ensureCursor()
  const products = await fetchProductsAfter(
    watermark,
    Math.min(Math.max(limit, 1), 100)
  )
  result.checked = products.length

  for (const product of products) {
    try {
      const existing = await findExistingItem(product)
      if (existing) {
        const linked = await linkOdooIdIfMissing(existing.name, product.id)
        if (linked) {
          result.linked += 1
          logger.info("Linked existing ERPNext item to Odoo product", {
            productId: product.id,
            item: existing.name,
            via: existing.reason,
          })
        } else {
          result.skipped += 1
        }
        await setCursor(product.id)
        continue
      }

      const name = await createItem(product)
      result.created += 1
      await setCursor(product.id)
      logger.info("Odoo product created in ERPNext", {
        productId: product.id,
        odoo: product.displayName,
        erpnext: name,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product sync failed"

      // Race / duplicate: treat as linked/skipped and advance cursor.
      if (/exists|duplicate/i.test(message)) {
        const again = await findExistingItem(product)
        if (again) {
          await linkOdooIdIfMissing(again.name, product.id)
          result.skipped += 1
          await setCursor(product.id)
          continue
        }
      }

      result.failed += 1
      result.errors.push({
        product: `${product.id}:${product.displayName}`,
        error: message,
      })
      logger.error("Odoo→ERPNext product sync failed", {
        productId: product.id,
        name: product.displayName,
        error: message,
      })
      // Stop so the same product is retried next run (no silent skip).
      break
    }
  }

  return result
}
