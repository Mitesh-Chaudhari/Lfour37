'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'

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
  /** Delhivery remarks e.g. "Embargo" — warning, not always a hard block */
  remarks?: string | null
}

/**
 * Watches a PIN code value and looks up city/state (+ Delhivery serviceability)
 * once 6 digits are entered. `onAutofill` fires with the result so the caller
 * can populate its form fields.
 *
 * Same return shape as before (`status`, `data`) — backed by React Query cache.
 */
export function usePincodeLookup(
  pin: string | undefined,
  onAutofill?: (data: PincodeData) => void
) {
  const [debouncedPin, setDebouncedPin] = useState('')
  const onAutofillRef = useRef(onAutofill)
  onAutofillRef.current = onAutofill
  const lastAutofillKey = useRef<string | null>(null)

  const normalized = (pin ?? '').trim()
  const isComplete = /^\d{6}$/.test(normalized)

  useEffect(() => {
    if (!isComplete) {
      setDebouncedPin('')
      lastAutofillKey.current = null
      return
    }

    const timer = window.setTimeout(() => {
      setDebouncedPin(normalized)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [normalized, isComplete])

  const query = useQuery({
    queryKey: queryKeys.pincode(debouncedPin),
    queryFn: () => apiGet<PincodeData>(`/api/pincode?code=${debouncedPin}`),
    enabled: /^\d{6}$/.test(debouncedPin),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  })

  useEffect(() => {
    if (!query.data || !debouncedPin) return
    if (lastAutofillKey.current === debouncedPin) return
    if (!(query.data.city || query.data.state)) return

    lastAutofillKey.current = debouncedPin
    onAutofillRef.current?.(query.data)
  }, [query.data, debouncedPin])

  let status: PincodeStatus = 'idle'
  if (!isComplete) {
    status = 'idle'
  } else if (!debouncedPin || query.isFetching) {
    status = 'loading'
  } else if (query.isError) {
    status = 'error'
  } else if (query.data?.serviceable === false) {
    status = 'unserviceable'
  } else if (query.data?.city || query.data?.state) {
    status = 'success'
  } else if (query.data) {
    status = 'error'
  } else {
    status = 'loading'
  }

  return {
    status,
    data: isComplete && debouncedPin ? query.data ?? null : null,
  }
}
