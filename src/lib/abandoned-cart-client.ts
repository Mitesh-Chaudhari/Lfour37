'use client'

import type { CartItem } from '@/types'
import { serializeCartItemsForAbandonedCart } from '@/lib/abandoned-cart'

const SYNC_DEBOUNCE_MS = 1500

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastPayloadKey = ''

function cartPayloadKey(items: CartItem[]): string {
  return items
    .map((item) => `${item.variant_id}:${item.quantity}`)
    .sort()
    .join('|')
}

async function postCartSync(items: CartItem[]) {
  try {
    const body = {
      items: serializeCartItemsForAbandonedCart(items),
    }

    await fetch('/api/cart/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
      keepalive: true,
    })
  } catch {
    // Best-effort; cron simply won't see this update.
  }
}

/** Debounced sync of local cart → abandoned_carts (logged-in users only; API checks auth/phone). */
export function scheduleAbandonedCartSync(items: CartItem[]) {
  const key = cartPayloadKey(items)
  if (key === lastPayloadKey && items.length > 0) {
    // Still update activity timestamp when same items? Skip identical payloads.
    // For idle timer we need cart_updated_at to move on real changes only — OK to skip.
  }

  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(() => {
    lastPayloadKey = key
    void postCartSync(items)
  }, SYNC_DEBOUNCE_MS)
}

export function flushAbandonedCartSync(items: CartItem[]) {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  lastPayloadKey = cartPayloadKey(items)
  void postCartSync(items)
}
