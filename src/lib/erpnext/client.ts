const BASE_URL = process.env.ERPNEXT_URL?.replace(/\/$/, "")
const API_KEY = process.env.ERPNEXT_API_KEY
const API_SECRET = process.env.ERPNEXT_API_SECRET

export function isErpNextConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY && API_SECRET)
}

type ErpResponse = {
  data?: Record<string, unknown>
  message?: unknown
  exception?: string
  exc?: string
  _server_messages?: string
}

export class ErpNextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ErpNextError"
  }
}

function errorText(body: ErpResponse | null, raw: string): string {
  const serverMessages = body?._server_messages
  if (typeof serverMessages === "string" && serverMessages.trim()) {
    try {
      const parsed = JSON.parse(serverMessages) as string[]
      const texts = parsed.map((entry) => {
        try {
          const row = JSON.parse(entry) as { message?: string }
          return row.message || entry
        } catch {
          return entry
        }
      })
      if (texts.length) return texts.join("; ").slice(0, 800)
    } catch {
      // fall through
    }
  }
  const message = body?.exception || body?.exc || body?.message || raw
  const text = typeof message === "string" ? message : JSON.stringify(message)
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800)
}

export async function erpFetch(path: string, init?: RequestInit): Promise<ErpResponse> {
  if (!isErpNextConfigured()) {
    throw new ErpNextError("ERPNext is not configured")
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `token ${API_KEY}:${API_SECRET}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })

  const raw = await response.text()
  let body: ErpResponse | null = null
  if (raw) {
    try {
      body = JSON.parse(raw) as ErpResponse
    } catch {
      body = { message: raw }
    }
  }

  if (!response.ok) {
    throw new ErpNextError(errorText(body, raw) || `ERPNext request failed (${response.status})`)
  }

  return body || {}
}

export async function erpGetList(
  doctype: string,
  filters: unknown[],
  fields: string[]
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    filters: JSON.stringify(filters),
    fields: JSON.stringify(fields),
    limit_page_length: "100",
    order_by: "modified desc",
  })
  const body = await erpFetch(
    `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`
  )
  return Array.isArray(body.data) ? (body.data as unknown as Array<Record<string, unknown>>) : []
}

export async function erpGet(
  doctype: string,
  name: string
): Promise<Record<string, unknown>> {
  const body = await erpFetch(
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
  )
  return (body.data || {}) as Record<string, unknown>
}

export async function erpInsert(
  doctype: string,
  doc: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const body = await erpFetch(`/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(doc),
  })
  return (body.data || {}) as Record<string, unknown>
}

export async function erpUpdate(
  doctype: string,
  name: string,
  doc: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const body = await erpFetch(
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      body: JSON.stringify(doc),
    }
  )
  return (body.data || {}) as Record<string, unknown>
}

export async function erpDelete(doctype: string, name: string): Promise<void> {
  await erpFetch(
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  )
}

export async function erpSubmit(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body = await erpFetch("/api/method/frappe.client.submit", {
    method: "POST",
    body: JSON.stringify({ doc }),
  })
  return (body.message || {}) as Record<string, unknown>
}

export async function erpCancel(doctype: string, name: string): Promise<void> {
  await erpFetch("/api/method/frappe.client.cancel", {
    method: "POST",
    body: JSON.stringify({ doctype, name }),
  })
}

export async function erpMethod(
  method: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const body = await erpFetch(`/api/method/${method}`, {
    method: "POST",
    body: JSON.stringify(args),
  })
  const message = body.message
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new ErpNextError(`ERPNext method ${method} did not return a document`)
  }
  return message as Record<string, unknown>
}
