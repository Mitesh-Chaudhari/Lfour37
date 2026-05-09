'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function CancelRequestActions({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleAction = async (type: 'approve' | 'reject') => {
    setLoading(true)

    const url =
      type === 'approve'
        ? '/api/admin/orders/cancel-approve'
        : '/api/admin/orders/cancel-reject'

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
    })

    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="destructive"
        onClick={() => handleAction('approve')}
        loading={loading}
      >
        Approve
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={() => handleAction('reject')}
        loading={loading}
      >
        Reject
      </Button>
    </div>
  )
}