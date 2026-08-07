'use client'

import { createClient } from '@/lib/supabase/client'
import { getOrCreateSessionId } from '@/lib/attribution'

export type FunnelEventType =
  | 'page_view'
  | 'view_item'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'session_start'

type TrackOptions = {
  productId?: string | null
  orderId?: string | null
  properties?: Record<string, unknown>
}

let sessionStarted = false

export async function trackFunnelEvent(
  eventType: FunnelEventType,
  options: TrackOptions = {}
): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const sessionId = getOrCreateSessionId()
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (eventType !== 'session_start' && !sessionStarted) {
      sessionStarted = true
      await supabase.from('analytics_events').insert({
        event_type: 'session_start',
        user_id: user?.id || null,
        session_id: sessionId,
        properties: { path: window.location.pathname },
      })
    }

    if (eventType === 'session_start') {
      sessionStarted = true
    }

    await supabase.from('analytics_events').insert({
      event_type: eventType,
      user_id: user?.id || null,
      session_id: sessionId,
      product_id: options.productId || null,
      order_id: options.orderId || null,
      properties: {
        path: window.location.pathname,
        ...(options.properties || {}),
      },
    })
  } catch {
    // Never block UX on analytics
  }
}
