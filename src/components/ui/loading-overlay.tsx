'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingOverlayProps {
  show: boolean
  message?: string
  fullScreen?: boolean
  className?: string
}

export function LoadingOverlay({
  show,
  message,
  fullScreen = false,
  className,
}: LoadingOverlayProps) {
  if (!show) return null

  return (
    <div
      className={cn(
        'z-50 flex items-center justify-center bg-white/75 backdrop-blur-[2px]',
        fullScreen ? 'fixed inset-0' : 'absolute inset-0 rounded-[inherit]',
        className
      )}
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="flex flex-col items-center gap-3 px-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        {message && (
          <p className="text-sm font-medium text-gray-700">{message}</p>
        )}
      </div>
    </div>
  )
}
