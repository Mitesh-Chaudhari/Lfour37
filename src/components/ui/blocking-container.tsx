'use client'

import { cn } from '@/lib/utils'
import { LoadingOverlay } from '@/components/ui/loading-overlay'

interface BlockingContainerProps {
  busy: boolean
  message?: string
  fullScreen?: boolean
  className?: string
  children: React.ReactNode
}

export function BlockingContainer({
  busy,
  message,
  fullScreen = false,
  className,
  children,
}: BlockingContainerProps) {
  return (
    <div className={cn('relative', className)} aria-busy={busy}>
      <LoadingOverlay show={busy} message={message} fullScreen={fullScreen} />
      {/* display:contents keeps children in the parent grid/flex/spacing flow */}
      <fieldset
        disabled={busy}
        className="contents min-w-0 border-0 p-0 m-0 disabled:pointer-events-none"
      >
        {children}
      </fieldset>
    </div>
  )
}
