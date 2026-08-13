/** Pure Delhivery status helpers (safe for client + server). */

export function normalizeCarrierStatus(status: string): string {
  return (status || '').trim().toLowerCase()
}

/**
 * Delhivery marks return-to-origin with StatusType "RT".
 * Status text may be "RTO - In Transit", "In Transit", "Dispatched", etc.
 */
export function isDelhiveryRtoStatus(
  status: string,
  statusType?: string | null,
  instructions?: string | null
): boolean {
  const type = (statusType || '').toUpperCase()
  if (type === 'RT') return true

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
  instructions?: string | null
): boolean {
  if (!isDelhiveryRtoStatus(status, statusType, instructions)) return false
  const text = `${status || ''} ${instructions || ''}`.toLowerCase()
  return (
    text.includes('rto delivered') ||
    text.includes('delivered to origin') ||
    text.includes('dto') ||
    (text.includes('delivered') && text.includes('rto'))
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
