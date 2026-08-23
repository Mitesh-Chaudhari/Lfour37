'use client'

import { useRef, useState } from 'react'
import { Download, FileDown, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface InvoiceDownloadButtonProps {
  orderId: string
  orderNumber: string
  variant?: 'button' | 'link'
  className?: string
}

function triggerBrowserDownload(orderId: string, orderNumber: string) {
  const anchor = document.createElement('a')
  anchor.href = `/api/invoices/${orderId}`
  anchor.download = `invoice-${orderNumber}.pdf`
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function InvoiceDownloadButton({
  orderId,
  orderNumber,
  variant = 'button',
  className,
}: InvoiceDownloadButtonProps) {
  const [loading, setLoading] = useState(false)
  const inFlightRef = useRef(false)

  async function handleDownload() {
    if (inFlightRef.current) return

    inFlightRef.current = true
    setLoading(true)

    try {
      const response = await fetch(`/api/invoices/${orderId}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      const contentType = response.headers.get('content-type') || ''

      if (!response.ok) {
        let message = 'Failed to generate invoice'
        if (contentType.includes('application/json')) {
          try {
            const data = await response.json()
            if (typeof data.error === 'string') {
              message = data.error
            }
          } catch {
            // Ignore JSON parse errors.
          }
        }
        throw new Error(message)
      }

      if (!contentType.includes('application/pdf')) {
        throw new Error('Invoice download returned an unexpected response')
      }

      const blob = await response.blob()
      if (!blob.size) {
        throw new Error('Invoice file was empty')
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `invoice-${orderNumber}.pdf`
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to download invoice'

      if (message === 'Failed to fetch') {
        triggerBrowserDownload(orderId, orderNumber)
        toast.success('Invoice download started')
      } else {
        toast.error(message)
      }
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? 'Generating invoice' : 'Download invoice'}
        className={cn(
          'flex items-center gap-1 text-sm text-gray-600 hover:text-purple-600 transition-colors disabled:opacity-60 disabled:cursor-wait',
          className
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        {loading ? 'Generating…' : 'Invoice'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      aria-busy={loading}
      aria-label={loading ? 'Generating invoice' : 'Download invoice'}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 border border-purple-200 hover:border-purple-300 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-wait',
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {loading ? 'Generating…' : 'Download'}
    </button>
  )
}
