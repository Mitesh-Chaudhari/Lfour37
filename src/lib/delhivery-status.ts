/** Pure Delhivery status helpers (safe for client + server). */

export function normalizeCarrierStatus(status: string): string {
  return (status || '').trim().toLowerCase()
}

/** Collapse spaces/underscores/hyphens so "outfordelivery" matches "out for delivery". */
export function compactCarrierStatus(status: string): string {
  return normalizeCarrierStatus(status).replace(/[\s_\-./]+/g, '')
}

/** Phrase match that tolerates DTDC compact statuses (no spaces). */
export function carrierStatusIncludes(
  status: string,
  phrase: string
): boolean {
  const normalized = normalizeCarrierStatus(status)
  const needle = phrase.toLowerCase().trim()
  if (!needle) return false
  if (normalized.includes(needle)) return true

  const compact = compactCarrierStatus(status)
  const compactNeedle = needle.replace(/[\s_\-./]+/g, '')

  // "undelivered" contains "delivered" as a substring — never treat that as a match.
  if (compactNeedle === 'delivered') {
    return (
      compact === 'delivered' ||
      (compact.includes('delivered') &&
        !compact.includes('undelivered') &&
        !compact.includes('notdelivered'))
    )
  }

  return compact.includes(compactNeedle)
}

/** True only for successful delivery (excludes Undelivered / NDR). */
export function isSuccessfulDeliveredStatus(status: string): boolean {
  const compact = compactCarrierStatus(status)
  if (
    compact.includes('undelivered') ||
    compact.includes('notdelivered') ||
    compact.includes('attempted')
  ) {
    return false
  }
  return carrierStatusIncludes(status, 'delivered')
}

/**
 * Delhivery marks return-to-origin with StatusType "RT".
 * Status text may be "RTO - In Transit", "In Transit", "Dispatched", etc.
 */
export function isDelhiveryRtoStatus(
  status: string,
  statusType?: string | null,
  instructions?: string | null,
  statusCode?: string | null
): boolean {
  const type = (statusType || '').toUpperCase()
  if (type === 'RT') return true

  const code = (statusCode || '').toUpperCase()
  if (
    code === 'RTO' ||
    code.startsWith('RTO') ||
    code === 'IRTO' ||
    code === 'SETRTO' ||
    code === 'RTODLV'
  ) {
    return true
  }

  const text = `${status || ''} ${instructions || ''}`.toLowerCase()
  return (
    text.includes('rto') ||
    text.includes('return to origin') ||
    text.includes('returned to origin') ||
    text.includes('returned to seller')
  )
}

export function isDelhiveryRtoDelivered(
  status: string,
  statusType?: string | null,
  instructions?: string | null,
  statusCode?: string | null
): boolean {
  if (!isDelhiveryRtoStatus(status, statusType, instructions, statusCode)) return false

  const code = (statusCode || '').toUpperCase()
  if (code === 'RD' || code === 'DTO' || code === 'RTODLV') return true

  const text = `${status || ''} ${instructions || ''}`.toLowerCase()
  return (
    text.includes('rto delivered') ||
    text.includes('delivered to origin') ||
    text.includes('returned to seller') ||
    text.includes('received at origin') ||
    text.includes('received at warehouse') ||
    text.includes('reached origin') ||
    text.includes('dto') ||
    (text.includes('delivered') &&
      (text.includes('rto') || text.includes('origin')))
  )
}

/** Prefer a Delhivery-One-style label when StatusType is RT but text omits "RTO". */
export function formatDelhiveryCarrierStatus(
  status: string,
  statusType?: string | null,
  instructions?: string | null
): string {
  const raw = (status || '').trim() || 'Unknown'
  if (!isDelhiveryRtoStatus(raw, statusType, instructions)) return raw
  if (/\brto\b/i.test(raw) || /return to origin/i.test(raw)) return raw
  return `RTO - ${raw}`
}
