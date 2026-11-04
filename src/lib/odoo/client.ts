const DEFAULT_URL = "https://yadevi.odoo.com"
const DEFAULT_DB = "yadevi"

type JsonRpcResult = {
  result?: unknown
  error?: { message?: string; data?: { message?: string } }
}

export class OdooError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OdooError"
  }
}

export function isOdooConfigured(): boolean {
  return Boolean(
    process.env.ODOO_USERNAME?.trim() && process.env.ODOO_API_KEY?.trim()
  )
}

function odooUrl(): string {
  return (process.env.ODOO_URL || DEFAULT_URL).replace(/\/$/, "")
}

function odooDb(): string {
  return process.env.ODOO_DB?.trim() || DEFAULT_DB
}

async function jsonRpc(
  service: string,
  method: string,
  args: unknown[]
): Promise<unknown> {
  const response = await fetch(`${odooUrl()}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
  })

  const raw = await response.text()
  let body: JsonRpcResult | null = null
  try {
    body = JSON.parse(raw) as JsonRpcResult
  } catch {
    throw new OdooError(`Odoo returned non-JSON (${response.status})`)
  }

  if (!response.ok) {
    throw new OdooError(`Odoo HTTP ${response.status}`)
  }
  if (body.error) {
    throw new OdooError(
      body.error.data?.message || body.error.message || "Odoo RPC error"
    )
  }
  return body.result
}

let cachedUid: number | null = null

export async function odooAuthenticate(): Promise<number> {
  if (cachedUid) return cachedUid
  if (!isOdooConfigured()) {
    throw new OdooError("Odoo is not configured")
  }

  const uid = await jsonRpc("common", "authenticate", [
    odooDb(),
    process.env.ODOO_USERNAME,
    process.env.ODOO_API_KEY,
    {},
  ])

  if (typeof uid !== "number" || uid <= 0) {
    throw new OdooError("Odoo authentication failed")
  }
  cachedUid = uid
  return uid
}

export async function odooExecuteKw(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const uid = await odooAuthenticate()
  return jsonRpc("object", "execute_kw", [
    odooDb(),
    uid,
    process.env.ODOO_API_KEY,
    model,
    method,
    args,
    kwargs,
  ])
}

export type OdooInvoiceLine = {
  id: number
  productId: number | null
  name: string
  quantity: number
  priceUnit: number
  discount: number
  priceSubtotal: number
  barcode: string | null
}

export type OdooPaymentInfo = {
  journalName: string
  amount: number
  paymentDate: string | null
}

export type OdooInvoice = {
  id: number
  name: string
  date: string
  amountUntaxed: number
  amountTax: number
  amountTotal: number
  amountResidual: number
  paymentState: string
  partnerName: string | null
  lines: OdooInvoiceLine[]
  payments: OdooPaymentInfo[]
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function str(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return ""
}

function many2oneId(value: unknown): number | null {
  if (Array.isArray(value) && typeof value[0] === "number") return value[0]
  if (typeof value === "number" && value > 0) return value
  return null
}

function many2oneName(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[1] === "string") return value[1]
  return null
}

/** Highest posted customer invoice id (for first-run watermark). */
export async function fetchMaxPostedInvoiceId(): Promise<number> {
  const rows = asRecords(
    await odooExecuteKw(
      "account.move",
      "search_read",
      [
        [
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
        ],
      ],
      {
        fields: ["id"],
        limit: 1,
        order: "id desc",
      }
    )
  )
  return rows[0] ? num(rows[0].id) : 0
}

export async function fetchPostedInvoicesAfter(
  afterMoveId: number,
  limit = 20
): Promise<OdooInvoice[]> {
  const moves = asRecords(
    await odooExecuteKw(
      "account.move",
      "search_read",
      [
        [
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["id", ">", afterMoveId],
        ],
      ],
      {
        fields: [
          "id",
          "name",
          "invoice_date",
          "date",
          "amount_untaxed",
          "amount_tax",
          "amount_total",
          "amount_residual",
          "payment_state",
          "partner_id",
          "invoice_line_ids",
        ],
        limit,
        order: "id asc",
      }
    )
  )

  if (moves.length === 0) return []

  const lineIds = [
    ...new Set(
      moves.flatMap((move) =>
        Array.isArray(move.invoice_line_ids)
          ? (move.invoice_line_ids as number[])
          : []
      )
    ),
  ]

  const rawLines = lineIds.length
    ? asRecords(
        await odooExecuteKw(
          "account.move.line",
          "search_read",
          [[["id", "in", lineIds]]],
          {
            fields: [
              "id",
              "move_id",
              "product_id",
              "name",
              "quantity",
              "price_unit",
              "discount",
              "price_subtotal",
              "display_type",
            ],
          }
        )
      )
    : []

  const productIds = [
    ...new Set(
      rawLines
        .map((line) => many2oneId(line.product_id))
        .filter((id): id is number => Boolean(id))
    ),
  ]

  const barcodeByProduct = new Map<number, string | null>()
  if (productIds.length) {
    const products = asRecords(
      await odooExecuteKw(
        "product.product",
        "search_read",
        [[["id", "in", productIds]]],
        { fields: ["id", "barcode"] }
      )
    )
    for (const product of products) {
      const id = num(product.id)
      const barcode = str(product.barcode).trim()
      barcodeByProduct.set(id, barcode || null)
    }
  }

  const moveIds = moves.map((move) => num(move.id))
  const paymentsByMove = await fetchPaymentsForMoves(moveIds)

  const linesByMove = new Map<number, OdooInvoiceLine[]>()
  for (const line of rawLines) {
    if (str(line.display_type)) continue
    const productId = many2oneId(line.product_id)
    if (!productId) continue
    const qty = num(line.quantity)
    if (qty <= 0) continue

    const moveId = many2oneId(line.move_id)
    if (!moveId) continue

    const entry: OdooInvoiceLine = {
      id: num(line.id),
      productId,
      name: str(line.name),
      quantity: qty,
      priceUnit: num(line.price_unit),
      discount: num(line.discount),
      priceSubtotal: num(line.price_subtotal),
      barcode: barcodeByProduct.get(productId) || null,
    }
    const list = linesByMove.get(moveId) || []
    list.push(entry)
    linesByMove.set(moveId, list)
  }

  return moves.map((move) => {
    const id = num(move.id)
    return {
      id,
      name: str(move.name),
      date: str(move.invoice_date || move.date).slice(0, 10),
      amountUntaxed: num(move.amount_untaxed),
      amountTax: num(move.amount_tax),
      amountTotal: num(move.amount_total),
      amountResidual: num(move.amount_residual),
      paymentState: str(move.payment_state) || "not_paid",
      partnerName: many2oneName(move.partner_id),
      lines: linesByMove.get(id) || [],
      payments: paymentsByMove.get(id) || [],
    }
  })
}

async function fetchPaymentsForMoves(
  moveIds: number[]
): Promise<Map<number, OdooPaymentInfo[]>> {
  const result = new Map<number, OdooPaymentInfo[]>()
  if (moveIds.length === 0) return result

  try {
    const partials = asRecords(
      await odooExecuteKw(
        "account.partial.reconcile",
        "search_read",
        [
          [
            "|",
            ["debit_move_id.move_id", "in", moveIds],
            ["credit_move_id.move_id", "in", moveIds],
          ],
        ],
        {
          fields: [
            "amount",
            "debit_move_id",
            "credit_move_id",
            "max_date",
          ],
          limit: 500,
        }
      )
    )

    const amlIds = [
      ...new Set(
        partials.flatMap((row) => {
          const ids: number[] = []
          const debit = many2oneId(row.debit_move_id)
          const credit = many2oneId(row.credit_move_id)
          if (debit) ids.push(debit)
          if (credit) ids.push(credit)
          return ids
        })
      ),
    ]

    if (amlIds.length === 0) return result

    const amls = asRecords(
      await odooExecuteKw(
        "account.move.line",
        "search_read",
        [[["id", "in", amlIds]]],
        { fields: ["id", "move_id", "payment_id"] }
      )
    )

    const amlById = new Map(amls.map((row) => [num(row.id), row]))
    const paymentIds = [
      ...new Set(
        amls
          .map((row) => many2oneId(row.payment_id))
          .filter((id): id is number => Boolean(id))
      ),
    ]

    const payments = paymentIds.length
      ? asRecords(
          await odooExecuteKw(
            "account.payment",
            "search_read",
            [[["id", "in", paymentIds]]],
            { fields: ["id", "journal_id", "amount", "date"] }
          )
        )
      : []
    const paymentById = new Map(payments.map((row) => [num(row.id), row]))

    for (const partial of partials) {
      const debitAml = amlById.get(many2oneId(partial.debit_move_id) || -1)
      const creditAml = amlById.get(many2oneId(partial.credit_move_id) || -1)
      const candidates = [debitAml, creditAml].filter(Boolean)
      for (const aml of candidates) {
        if (!aml) continue
        const moveId = many2oneId(aml.move_id)
        if (!moveId || !moveIds.includes(moveId)) continue
        const paymentId = many2oneId(aml.payment_id)
        const payment = paymentId ? paymentById.get(paymentId) : null
        const journalName = payment
          ? many2oneName(payment.journal_id) || "Unknown"
          : "Unknown"
        const list = result.get(moveId) || []
        list.push({
          journalName,
          amount: num(partial.amount || payment?.amount),
          paymentDate: payment ? str(payment.date).slice(0, 10) : null,
        })
        result.set(moveId, list)
      }
    }
  } catch {
    // Payments are best-effort; unpaid invoices still sync as cash-pending-style sales.
  }

  return result
}
