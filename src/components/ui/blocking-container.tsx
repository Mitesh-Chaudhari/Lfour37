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
    <div className={cn('relative', className)}>
      <LoadingOverlay show={busy} message={message} fullScreen={fullScreen} />
      <fieldset disabled={busy} className="min-w-0 border-0 p-0 m-0">
        {children}
      </fieldset>
    </div>
  )
}
