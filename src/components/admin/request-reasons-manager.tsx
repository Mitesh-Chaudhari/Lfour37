'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export type RequestReasonKind = 'return' | 'exchange'

type RequestReason = {
  id: string
  label: string
  kind: RequestReasonKind
  is_active?: boolean
}

interface RequestReasonsManagerProps {
  kind: RequestReasonKind
  title: string
}

export default function RequestReasonsManager({
  kind,
  title,
}: RequestReasonsManagerProps) {
  const [reasons, setReasons] = useState<RequestReason[]>([])
  const [newReason, setNewReason] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchReasons = useCallback(async () => {
    const res = await fetch(
      `/api/admin/return-reasons?kind=${kind}&includeInactive=false`
    )
    const data = await res.json()
    setReasons(Array.isArray(data) ? data : [])
  }, [kind])

  useEffect(() => {
    void fetchReasons()
  }, [fetchReasons])

  const addReason = async () => {
    const label = newReason.trim()
    if (!label) {
      toast.error(`Enter a ${kind} reason`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/return-reasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, kind }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to add reason')
        return
      }
      setNewReason('')
      await fetchReasons()
      toast.success('Reason added')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (reason: RequestReason) => {
    setEditingId(reason.id)
    setEditingLabel(reason.label)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingLabel('')
  }

  const saveEdit = async (id: string) => {
    const label = editingLabel.trim()
    if (!label) {
      toast.error('Reason cannot be empty')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/return-reasons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to update reason')
        return
      }

      setReasons((prev) =>
        prev.map((reason) =>
          reason.id === id ? { ...reason, label } : reason
        )
      )
      cancelEdit()
      toast.success('Reason updated')
    } finally {
      setSaving(false)
    }
  }

  const deleteReason = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/return-reasons/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast.error('Failed to delete reason')
        return
      }
      if (editingId === id) cancelEdit()
      await fetchReasons()
      toast.success('Reason deleted')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold">{title}</h2>

      <div className="flex gap-2">
        <input
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addReason()
          }}
          className="w-full rounded border px-3 py-2"
          placeholder={`Add new ${kind} reason`}
          disabled={saving}
        />
        <Button onClick={addReason} disabled={saving}>
          Add
        </Button>
      </div>

      {reasons.length === 0 && (
        <p className="text-sm text-gray-500">No {kind} reasons yet.</p>
      )}

      {reasons.map((r) => {
        const isEditing = editingId === r.id

        return (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded border p-2 sm:flex-row sm:items-center sm:justify-between"
          >
            {isEditing ? (
              <input
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveEdit(r.id)
                  if (e.key === 'Escape') cancelEdit()
                }}
                className="w-full rounded border px-3 py-2"
                autoFocus
                disabled={saving}
              />
            ) : (
              <span>{r.label}</span>
            )}

            <div className="flex shrink-0 gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => void saveEdit(r.id)}
                    className="text-sm font-medium text-green-600"
                    disabled={saving}
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="text-sm text-gray-500"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startEdit(r)}
                  className="text-sm text-blue-600"
                  disabled={saving}
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => void deleteReason(r.id)}
                className="text-sm text-red-500"
                disabled={saving}
              >
                Delete
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
