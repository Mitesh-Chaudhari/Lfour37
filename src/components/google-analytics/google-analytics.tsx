'use client'

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  GA_MEASUREMENT_ID,
  isGoogleAnalyticsEnabled,
  trackGaPageView,
} from '@/lib/google-analytics'

export function GoogleAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (!isGoogleAnalyticsEnabled()) return

    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const query = searchParams.toString()
    const url = query ? `${pathname}?${query}` : pathname
    trackGaPageView(url)
  }, [pathname, searchParams])

  if (!isGoogleAnalyticsEnabled()) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              page_path: window.location.pathname + window.location.search
            });
          `,
        }}
      />
    </>
  )
}
