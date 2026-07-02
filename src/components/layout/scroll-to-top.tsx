'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Jump to top instantly on route change (avoids smooth-scroll animation from listing pages). */
export function ScrollToTop() {
  const pathname = usePathname()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
