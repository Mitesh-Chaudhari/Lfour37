'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

interface Category {
  id: string
  name: string
  parent_id: string | null
}

interface HsnMapping {
  id: string
  category_id: string
  hsn_code: string
  created_at: string | null
  updated_at: string | null
}

interface HsnCodesClientProps {
  categories: Category[]
  mappings: HsnMapping[]
}

function getCategoryLabel(
  category: Category,
  categoryById: Map<string, Category>
): string {
  const parts: string[] = [category.name]
  let parentId = category.parent_id

  while (parentId) {
    const parent = categoryById.get(parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parent_id
  }

  return parts.join(' › ')
}

export function HsnCodesClient({
  categories,
  mappings: initialMappings,
}: HsnCodesClientProps) {
  const supabase = createClient()
  const [mappings, setMappings] = useState(initialMappings)
  const [editing, setEditing] = useState<HsnMapping | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [hsnCode, setHsnCode] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  )

  const mappedCategoryIds = new Set(mappings.map((mapping) => mapping.category_id))

  const availableCategories = categories
    .filter((category) => !mappedCategoryIds.has(category.id) || editing?.category_id === category.id)
    .sort((a, b) =>
      getCategoryLabel(a, categoryById).localeCompare(getCategoryLabel(b, categoryById))
    )

  const sortedMappings = [...mappings].sort((a, b) => {
    const categoryA = categoryById.get(a.category_id)
    const categoryB = categoryById.get(b.category_id)
    const labelA = categoryA ? getCategoryLabel(categoryA, categoryById) : ''
    const labelB = categoryB ? getCategoryLabel(categoryB, categoryById) : ''
    return labelA.localeCompare(labelB)
  })

  const closeForm = () => {
    setEditing(null)
    setShowForm(false)
    setCategoryId('')
    setHsnCode('')
  }

  const startCreate = () => {
    setEditing(null)
    setCategoryId(availableCategories[0]?.id || '')
    setHsnCode('')
    setShowForm(true)
  }

  const startEdit = (mapping: HsnMapping) => {
    setEditing(mapping)
    setCategoryId(mapping.category_id)
    setHsnCode(mapping.hsn_code)
    setShowForm(true)
  }

  const saveMapping = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedHsn = hsnCode.trim()

    if (!categoryId) {
      toast.error('Please select a category')
      return
    }

    if (!trimmedHsn) {
      toast.error('HSN code is required')
      return
    }

    if (!/^\d{4,8}$/.test(trimmedHsn)) {
      toast.error('HSN code must be 4–8 digits')
      return
    }

    setIsSaving(true)
    try {
      if (editing) {
        const { data: updated, error } = await supabase
          .from('category_hsn_mappings')
          .update({
            category_id: categoryId,
            hsn_code: trimmedHsn,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id)
          .select('id, category_id, hsn_code, created_at, updated_at')
          .single()

        if (error) throw error
        setMappings((current) =>
          current.map((mapping) => (mapping.id === editing.id ? updated : mapping))
        )
        toast.success('HSN mapping updated')
      } else {
        const { data: created, error } = await supabase
          .from('category_hsn_mappings')
          .insert({ category_id: categoryId, hsn_code: trimmedHsn })
          .select('id, category_id, hsn_code, created_at, updated_at')
          .single()

        if (error) throw error
        setMappings((current) => [...current, created])
        toast.success('HSN mapping created')
      }

      closeForm()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save HSN mapping'
      toast.error(message.includes('unique') ? 'This category already has an HSN code' : message)
    } finally {
      setIsSaving(false)
    }
  }

  const deleteMapping = async (mapping: HsnMapping) => {
    const category = categoryById.get(mapping.category_id)
    const label = category ? getCategoryLabel(category, categoryById) : 'this category'

    if (!confirm(`Remove HSN mapping for "${label}"?`)) return

    const { error } = await supabase
      .from('category_hsn_mappings')
      .delete()
      .eq('id', mapping.id)

    if (error) {
      toast.error(error.message)
      return
    }

    setMappings((current) => current.filter((item) => item.id !== mapping.id))
    toast.success('HSN mapping deleted')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={showForm ? closeForm : startCreate} disabled={!showForm && availableCategories.length === 0}>
          <Plus className="h-4 w-4" />
          Add HSN Mapping
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={saveMapping}
          className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <h2 className="text-lg font-semibold">
              {editing ? 'Edit HSN Mapping' : 'New HSN Mapping'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Map a product category to its GST HSN code. Products in that category will auto-fill this value.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select category</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {getCategoryLabel(category, categoryById)}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="HSN Code"
            value={hsnCode}
            onChange={(event) => setHsnCode(event.target.value)}
            placeholder="e.g. 61091000"
            maxLength={8}
            autoFocus
            helperText="4–8 digit HSN/SAC code used on invoices."
          />

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" loading={isSaving}>
              {editing ? 'Update Mapping' : 'Create Mapping'}
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
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  HSN Code
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedMappings.map((mapping) => {
                const category = categoryById.get(mapping.category_id)
                return (
                  <tr key={mapping.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {category ? getCategoryLabel(category, categoryById) : 'Unknown category'}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">{mapping.hsn_code}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(mapping)}
                          className="p-1.5 text-gray-400 transition-colors hover:text-purple-600"
                          aria-label="Edit HSN mapping"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMapping(mapping)}
                          className="p-1.5 text-gray-400 transition-colors hover:text-red-600"
                          aria-label="Delete HSN mapping"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {mappings.length === 0 && (
          <div className="py-12 text-center text-gray-400">
            No HSN mappings yet. Add mappings so product forms auto-fill the correct HSN code.
          </div>
        )}
      </div>
    </div>
  )
}
