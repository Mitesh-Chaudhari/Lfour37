'use client'

import { useEffect, useRef, useState } from 'react'

export type PincodeStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'unserviceable'

export interface PincodeData {
  city: string | null
  state: string | null
  country: string
  /** null = serviceability could not be determined */
  serviceable: boolean | null
  codAvailable: boolean | null
}

/**
 * Watches a PIN code value and looks up city/state (+ Delhivery serviceability)
 * once 6 digits are entered. `onAutofill` fires with the result so the caller
 * can populate its form fields.
 */
export function usePincodeLookup(
  pin: string | undefined,
  onAutofill?: (data: PincodeData) => void
) {
  const [status, setStatus] = useState<PincodeStatus>('idle')
  const [data, setData] = useState<PincodeData | null>(null)

  // Keep the latest callback without retriggering the effect
  const onAutofillRef = useRef(onAutofill)
  onAutofillRef.current = onAutofill
  const lastLookedUpRef = useRef<string | null>(null)

  const normalized = (pin ?? '').trim()
  const isComplete = /^\d{6}$/.test(normalized)

  useEffect(() => {
    if (!isComplete) {
      setStatus('idle')
      setData(null)
      lastLookedUpRef.current = null
      return
    }

    if (lastLookedUpRef.current === normalized) return

    const controller = new AbortController()
    // Debounce so we don't fire while the user is still typing/correcting
    const timer = window.setTimeout(async () => {
      setStatus('loading')
      try {
        const res = await fetch(`/api/pincode?code=${normalized}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('Pincode lookup failed')

        const result: PincodeData = await res.json()
        lastLookedUpRef.current = normalized
        setData(result)

        if (result.serviceable === false) {
          setStatus('unserviceable')
        } else if (result.city || result.state) {
          setStatus('success')
        } else {
          setStatus('error')
        }

        if (result.city || result.state) {
          onAutofillRef.current?.(result)
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        setStatus('error')
        setData(null)
      }
    }, 400)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [normalized, isComplete])

  return { status, data }
}
