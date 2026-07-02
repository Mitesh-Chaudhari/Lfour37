'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { useNavigationStore } from '@/store/navigation-store'

function isInternalNavigationLink(anchor: HTMLAnchorElement, pathname: string): boolean {
  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false
  }

  if (anchor.target === '_blank' || anchor.hasAttribute('download')) {
    return false
  }

  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) return false

    const current = `${pathname}${window.location.search}`
    const next = `${url.pathname}${url.search}`
    return current !== next
  } catch {
    return false
  }
}

export function NavigationLoader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isNavigating, startNavigation, endNavigation } = useNavigationStore()

  const search = searchParams.toString()

  useEffect(() => {
    endNavigation()
  }, [pathname, search, endNavigation])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement).closest('a')
      if (!anchor || !isInternalNavigationLink(anchor, pathname)) return

      startNavigation()
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [pathname, startNavigation])

  return (
    <LoadingOverlay
      show={isNavigating}
      fullScreen
      message="Loading..."
      className="z-[100] bg-white/80"
    />
  )
}
