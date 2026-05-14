'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export default function CancelModal({ itemId, onClose }: any) {
  const [reasonId, setReasonId] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [reasons, setReasons] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const fetchReasons = async () => {
      const res = await fetch('/api/admin/cancel-reasons')
      const data = await res.json()

      // Add "Other"
      setReasons([
        ...data,
        { id: 'other', label: 'Other' },
      ])
    }

    fetchReasons()
  }, [])

  const handleCancel = async () => {
    if (!reasonId) return alert('Select reason')

    if (reasonId === 'other' && !customReason.trim()) {
      return alert('Please enter custom reason')
    }

    setLoading(true)

    const res = await fetch('/api/orders/cancel-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_item_id: itemId,
        reason_id: reasonId === 'other' ? null : reasonId,
        custom_reason: reasonId === 'other' ? customReason : null,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      alert(data.error || 'Failed to cancel')
      setLoading(false)
      return
    }

    onClose()
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl w-[400px] space-y-4">
        <h2 className="font-semibold text-lg">Cancel Item</h2>

        <select
          className="w-full border p-2 rounded"
          value={reasonId}
          onChange={(e) => setReasonId(e.target.value)}
        >
          <option value="">Select reason</option>
          {reasons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>

        {/* Show textarea when OTHER */}
        {reasonId === 'other' && (
          <textarea
            placeholder="Enter reason..."
            className="w-full border p-2 rounded"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            loading={loading}
          >
            Confirm Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}