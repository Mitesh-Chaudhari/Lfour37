import { GST_RATE } from '@/lib/invoice'

export function round2(value: number): number {
  return Number(value.toFixed(2))
}

/** Inclusive amount → taxable + GST split. */
export function splitInclusiveGst(
  inclusiveAmount: number,
  options?: { interstate?: boolean; rate?: number }
) {
  const rate = options?.rate ?? GST_RATE
  const inclusive = Number(inclusiveAmount) || 0
  const taxable = round2(inclusive / (1 + rate))
  const gst = round2(inclusive - taxable)
  const half = round2(gst / 2)
  const interstate = Boolean(options?.interstate)

  return {
    taxable,
    gst,
    cgst: interstate ? 0 : half,
    sgst: interstate ? 0 : half,
    igst: interstate ? gst : 0,
    rate,
    interstate,
  }
}

export function normalizeStateName(state: string | null | undefined): string {
  return (state || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function isInterstateSupply(
  customerState: string | null | undefined,
  companyState = 'gujarat'
): boolean {
  const customer = normalizeStateName(customerState)
  const company = normalizeStateName(companyState)
  if (!customer) return false
  return customer !== company
}

export function parseReportRange(from?: string | null, to?: string | null) {
  const now = new Date()
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = istParts.find((p) => p.type === 'year')?.value
  const m = istParts.find((p) => p.type === 'month')?.value
  const d = istParts.find((p) => p.type === 'day')?.value
  const today = `${y}-${m}-${d}`

  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today
  let fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : ''
  if (!fromDate) {
    const dt = new Date(`${toDate}T12:00:00+05:30`)
    dt.setDate(dt.getDate() - 29)
    fromDate = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  }

  return {
    fromDate,
    toDate,
    fromIso: `${fromDate}T00:00:00+05:30`,
    toIsoExclusive: (() => {
      const end = new Date(`${toDate}T00:00:00+05:30`)
      end.setDate(end.getDate() + 1)
      return end.toISOString()
    })(),
  }
}

export function istDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export const EXCLUDED_ORDER_STATUSES = [
  'cancelled',
  'refunded',
  'returned',
] as const

export function isCountableOnlineOrder(order: {
  status: string
  payment_method: string
  payment_status: string
}): boolean {
  if (EXCLUDED_ORDER_STATUSES.includes(order.status as (typeof EXCLUDED_ORDER_STATUSES)[number])) {
    return false
  }
  return order.payment_method === 'cod' || order.payment_status === 'completed'
}

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '')
          if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
          return value
        })
        .join(',')
    )
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
