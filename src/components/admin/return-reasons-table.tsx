'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export default function ReturnReasonsTable({
  reasons,
}: any) {
  const supabase = createClient()

  const [items, setItems] = useState(reasons)

  const [label, setLabel] = useState('')

  const createReason = async () => {
    if (!label.trim()) return

    const { data, error } = await supabase
      .from('return_reasons')
      .insert({
        label,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    setItems([data, ...items])
    setLabel('')

    toast.success('Reason added')
  }

  const deleteReason = async (id: string) => {
    const { error } = await supabase
      .from('return_reasons')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error(error.message)
      return
    }

    setItems(items.filter((i: any) => i.id !== id))

    toast.success('Deleted')
  }

  const toggleActive = async (
    id: string,
    is_active: boolean
  ) => {
    const { error } = await supabase
      .from('return_reasons')
      .update({
        is_active: !is_active,
      })
      .eq('id', id)

    if (error) {
      toast.error(error.message)
      return
    }

    setItems(
      items.map((i: any) =>
        i.id === id
          ? { ...i, is_active: !is_active }
          : i
      )
    )
  }

  return (
    <div className="bg-white rounded-2xl border p-6 space-y-6">

      {/* CREATE */}
      <div className="flex gap-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Reason"
          className="border rounded-lg px-3 py-2 flex-1"
        />

        <Button onClick={createReason}>
          Add
        </Button>
      </div>

      {/* LIST */}
      <div className="space-y-3">
        {items.map((item: any) => (
          <div
            key={item.id}
            className="flex items-center justify-between border rounded-lg p-3"
          >
            <div>
              <p className="font-medium">
                {item.label}
              </p>

              <p className="text-xs text-gray-500">
                {item.is_active
                  ? 'Active'
                  : 'Inactive'}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toggleActive(
                    item.id,
                    item.is_active
                  )
                }
              >
                {item.is_active
                  ? 'Disable'
                  : 'Enable'}
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  deleteReason(item.id)
                }
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}