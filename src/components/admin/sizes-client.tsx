'use client'

import { useState, type FormEvent } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

interface ProductSize {
  id: string
  name: string
  display_order: number | null
  created_at: string | null
}

interface SizesClientProps {
  sizes: ProductSize[]
  usageByName: Record<string, number>
}

export function SizesClient({
  sizes: initialSizes,
  usageByName: initialUsage,
}: SizesClientProps) {
  const supabase = createClient()
  const [sizes, setSizes] = useState(initialSizes)
  const [usageByName, setUsageByName] = useState(initialUsage)
  const [editing, setEditing] = useState<ProductSize | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [displayOrder, setDisplayOrder] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  const sortedSizes = [...sizes].sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      a.name.localeCompare(b.name)
  )

  const closeForm = () => {
    setEditing(null)
    setShowForm(false)
    setName('')
    setDisplayOrder(0)
  }

  const startCreate = () => {
    setEditing(null)
    setName('')
    setDisplayOrder(
      sizes.length === 0
        ? 0
        : Math.max(...sizes.map((size) => size.display_order ?? 0)) + 1
    )
    setShowForm(true)
  }

  const startEdit = (size: ProductSize) => {
    setEditing(size)
    setName(size.name)
    setDisplayOrder(size.display_order ?? 0)
    setShowForm(true)
  }

  const saveSize = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()

    if (!trimmedName) {
      toast.error('Size name is required')
      return
    }

    const duplicate = sizes.some(
      (size) =>
        size.id !== editing?.id &&
        size.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
    )
    if (duplicate) {
      toast.error('That size already exists')
      return
    }

    setIsSaving(true)
    try {
      if (editing) {
        const oldName = editing.name
        const { data: updated, error } = await supabase
          .from('product_sizes')
          .update({ name: trimmedName, display_order: displayOrder })
          .eq('id', editing.id)
          .select('id, name, display_order, created_at')
          .single()

        if (error) throw error

        if (oldName !== trimmedName) {
          const { error: variantsError } = await supabase
            .from('product_variants')
            .update({ size: trimmedName })
            .eq('size', oldName)

          if (variantsError) {
            await supabase
              .from('product_sizes')
              .update({ name: oldName, display_order: editing.display_order })
              .eq('id', editing.id)
            throw variantsError
          }

          setUsageByName((current) => {
            const next = { ...current }
            next[trimmedName] = next[oldName] || 0
            delete next[oldName]
            return next
          })
        }

        setSizes((current) =>
          current.map((size) => (size.id === editing.id ? updated : size))
        )
        toast.success('Size updated')
      } else {
        const { data: created, error } = await supabase
          .from('product_sizes')
          .insert({ name: trimmedName, display_order: displayOrder })
          .select('id, name, display_order, created_at')
          .single()

        if (error) throw error
        setSizes((current) => [...current, created])
        toast.success('Size created')
      }

      closeForm()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save size'
      toast.error(message.includes('unique') ? 'That size already exists' : message)
    } finally {
      setIsSaving(false)
    }
  }

  const deleteSize = async (size: ProductSize) => {
    const usageCount = usageByName[size.name] || 0
    if (usageCount > 0) {
      toast.error(
        `This size is used by ${usageCount} variant${usageCount === 1 ? '' : 's'}`
      )
      return
    }

    if (!confirm(`Delete size "${size.name}"?`)) return

    const { error } = await supabase
      .from('product_sizes')
      .delete()
      .eq('id', size.id)

    if (error) {
      toast.error(error.message)
      return
    }

    setSizes((current) => current.filter((item) => item.id !== size.id))
    toast.success('Size deleted')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={showForm ? closeForm : startCreate}>
          <Plus className="h-4 w-4" />
          Add Size
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={saveSize}
          className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <h2 className="text-lg font-semibold">
              {editing ? 'Edit Size' : 'New Size'}
            </h2>
          </div>
          <Input
            label="Size Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. M, XXL, 32, One Size"
            maxLength={50}
            autoFocus
          />
          <Input
            label="Display Order"
            type="number"
            min={0}
            value={displayOrder}
            onChange={(event) => setDisplayOrder(Number(event.target.value))}
            helperText="Lower numbers appear first."
          />
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" loading={isSaving}>
              {editing ? 'Update Size' : 'Create Size'}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  Display Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  Product Variants
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedSizes.map((size) => (
                <tr key={size.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{size.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {size.display_order ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {usageByName[size.name] || 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(size)}
                        className="p-1.5 text-gray-400 transition-colors hover:text-purple-600"
                        aria-label={`Edit ${size.name}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSize(size)}
                        className="p-1.5 text-gray-400 transition-colors hover:text-red-600"
                        aria-label={`Delete ${size.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sizes.length === 0 && (
          <div className="py-12 text-center text-gray-400">
            No sizes yet. Add your first size to use it in product variants.
          </div>
        )}
      </div>
    </div>
  )
}
