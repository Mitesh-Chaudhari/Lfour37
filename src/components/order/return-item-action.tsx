'use client'

import { useState } from 'react'
import { Button } from '../ui/button'
import ReturnModal from './return-modal'
import { isWithinReturnWindow } from '@/lib/returns'
import { getItemActionStatus } from '@/lib/order-status'

interface ReturnItemActionsProps {
  item: {
    id: string
    status?: string
    return_status?: string | null
    order_payment_method?: string
    [key: string]: unknown
  }
  deliveredAt?: string | null
}

export default function ReturnItemActions({
  item,
  deliveredAt,
}: ReturnItemActionsProps) {
  const [mode, setMode] = useState<'return' | 'exchange' | null>(null)

  if (
    getItemActionStatus({
      status: item.status,
      return_status: item.return_status,
    })
  ) {
    return null
  }

  if (!isWithinReturnWindow(deliveredAt)) {
    return null
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setMode('return')}>
          Return
        </Button>

        <Button
          size="sm"
          className="text-white cancel-order-btn"
          onClick={() => setMode('exchange')}
        >
          Exchange
        </Button>
      </div>

      {mode && (
        <ReturnModal item={item} mode={mode} onClose={() => setMode(null)} />
      )}
    </>
  )
}
