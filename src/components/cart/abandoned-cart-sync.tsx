'use client'

import { useEffect, useRef } from 'react'
import { useCartStore } from '@/store/cart-store'
import { scheduleAbandonedCartSync } from '@/lib/abandoned-cart-client'
import { createClient } from '@/lib/supabase/client'

/**
 * Keeps server-side abandoned_carts in sync for logged-in users.
 * Guests / users without phone are skipped by the API.
 */
export function AbandonedCartSync() {
  const items = useCartStore((state) => state.items)
  const hydrated = useRef(false)
  const isLoggedIn = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    const checkSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      isLoggedIn.current = Boolean(user)
      hydrated.current = true
      if (user) {
        scheduleAbandonedCartSync(useCartStore.getState().items)
      }
    }

    void checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      isLoggedIn.current = Boolean(session?.user)
      if (session?.user) {
        scheduleAbandonedCartSync(useCartStore.getState().items)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!hydrated.current || !isLoggedIn.current) return
    scheduleAbandonedCartSync(items)
  }, [items])

  return null
}
