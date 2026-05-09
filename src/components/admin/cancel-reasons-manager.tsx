'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function CancelReasonsManager() {
  const [reasons, setReasons] = useState<any[]>([])
  const [newReason, setNewReason] = useState('')

  const fetchReasons = async () => {
    const res = await fetch('/api/admin/cancel-reasons')
    const data = await res.json()
    setReasons(data)
  }

  useEffect(() => {
    fetchReasons()
  }, [])

  const addReason = async () => {
    await fetch('/api/admin/cancel-reasons', {
      method: 'POST',
      body: JSON.stringify({ label: newReason }),
    })
    setNewReason('')
    fetchReasons()
  }

  const deleteReason = async (id: string) => {
    await fetch(`/api/admin/cancel-reasons/${id}`, {
      method: 'DELETE',
    })
    fetchReasons()
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Cancel Reasons</h2>

      <div className="flex gap-2">
        <input
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          className="border px-3 py-2 rounded w-full"
          placeholder="Add new reason"
        />
        <Button onClick={addReason}>Add</Button>
      </div>

      {reasons.map((r) => (
        <div key={r.id} className="flex justify-between border p-2 rounded">
          <span>{r.label}</span>
          <button
            onClick={() => deleteReason(r.id)}
            className="text-red-500 text-sm"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}