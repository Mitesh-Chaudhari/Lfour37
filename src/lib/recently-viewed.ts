const STORAGE_KEY = 'tm_recently_viewed_product_ids'
const MAX_ITEMS = 12

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getRecentlyViewedIds(excludeId?: string): string[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const ids = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
    return excludeId ? ids.filter((id) => id !== excludeId) : ids
  } catch {
    return []
  }
}

export function trackRecentlyViewed(productId: string) {
  if (!canUseStorage() || !productId) return

  try {
    const existing = getRecentlyViewedIds()
    const next = [productId, ...existing.filter((id) => id !== productId)].slice(
      0,
      MAX_ITEMS
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode failures
  }
}
