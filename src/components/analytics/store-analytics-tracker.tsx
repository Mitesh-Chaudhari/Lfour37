'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { captureAttributionFromUrl } from '@/lib/attribution'
import { trackFunnelEvent } from '@/lib/analytics-events'

export function StoreAnalyticsTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    captureAttributionFromUrl(searchParams)
  }, [searchParams])

  useEffect(() => {
    void trackFunnelEvent('page_view', {
      properties: { path: pathname },
    })
  }, [pathname])

  return null
}
