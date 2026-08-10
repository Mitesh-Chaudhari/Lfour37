/** Business timezone for order dates, dashboard filters, and admin display. */
export const BUSINESS_TIMEZONE = 'Asia/Kolkata'

const IST_OFFSET = '+05:30'

/** Calendar date (YYYY-MM-DD) in Asia/Kolkata for a given instant. */
export function formatDateInBusinessTz(
  input: Date | string | number = new Date()
): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Start of an IST calendar day as UTC ISO (for DB range queries). */
export function startOfBusinessDayIso(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T00:00:00.000${IST_OFFSET}`).toISOString()
}

/** End of an IST calendar day as UTC ISO (for DB range queries). */
export function endOfBusinessDayIso(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T23:59:59.999${IST_OFFSET}`).toISOString()
}

/** Shift a YYYY-MM-DD calendar day by N days (date-only math, no TZ drift). */
export function shiftBusinessDay(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))
  return utc.toISOString().slice(0, 10)
}
