'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SizeGuideSection } from '@/components/size-guide/size-guide-section'
import type { SizeGuide, SizeGuideRow } from '@/lib/size-guides'

interface CategoryOption {
  id: string
  name: string
}

interface SizeGuideEditorProps {
  guide: SizeGuide
  categories: CategoryOption[]
  categoryIds: string[]
}

const emptyRow = {
  size_label: '',
  chest: '',
  shoulder: '',
  length: '',
  ideal_fit: '',
  display_order: 0,
}

export function SizeGuideEditor({
  guide: initialGuide,
  categories,
  categoryIds: initialCategoryIds,
}: SizeGuideEditorProps) {
  const [guide, setGuide] = useState(initialGuide)
  const [rows, setRows] = useState<SizeGuideRow[]>(
    [...(initialGuide.rows || [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    )
  )
  const [categoryIds, setCategoryIds] = useState<string[]>(initialCategoryIds)
  const [newRow, setNewRow] = useState(emptyRow)
  const [savingGuide, setSavingGuide] = useState(false)
  const [savingRowId, setSavingRowId] = useState<string | null>(null)

  const previewGuide = useMemo<SizeGuide>(
    () => ({
      ...guide,
      rows,
    }),
    [guide, rows]
  )

  const saveGuide = async () => {
    setSavingGuide(true)
    try {
      const res = await fetch(`/api/admin/size-guides/${guide.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: guide.title,
          subtitle: guide.subtitle,
          display_order: guide.display_order,
          is_active: guide.is_active,
          category_ids: categoryIds,
        }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(data?.error || 'Failed to save size guide')
        return
      }

      toast.success('Size guide saved')
    } catch {
      toast.error('Failed to save size guide')
    } finally {
      setSavingGuide(false)
    }
  }

  const addRow = async () => {
    if (!newRow.size_label.trim()) {
      toast.error('Size label is required')
      return
    }

    const res = await fetch(`/api/admin/size-guides/${guide.id}/rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newRow,
        display_order: rows.length + 1,
      }),
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      toast.error(data?.error || 'Failed to add row')
      return
    }

    setRows((current) => [...current, data.row])
    setNewRow(emptyRow)
    toast.success('Row added')
  }

  const saveRow = async (row: SizeGuideRow) => {
    setSavingRowId(row.id)
    try {
      const res = await fetch(`/api/admin/size-guides/${guide.id}/rows/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size_label: row.size_label,
          chest: row.chest,
          shoulder: row.shoulder,
          length: row.length,
          ideal_fit: row.ideal_fit,
          display_order: row.display_order,
        }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(data?.error || 'Failed to update row')
        return
      }

      toast.success('Row updated')
    } catch {
      toast.error('Failed to update row')
    } finally {
      setSavingRowId(null)
    }
  }

  const deleteRow = async (rowId: string) => {
    if (!confirm('Delete this size row?')) return

    const res = await fetch(`/api/admin/size-guides/${guide.id}/rows/${rowId}`, {
      method: 'DELETE',
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      toast.error(data?.error || 'Failed to delete row')
      return
    }

    setRows((current) => current.filter((row) => row.id !== rowId))
    toast.success('Row deleted')
  }

  const updateRowField = (
    rowId: string,
    field: keyof SizeGuideRow,
    value: string | number
  ) => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    )
  }

  const toggleCategory = (categoryId: string) => {
    setCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/size-guides" className="text-sm text-primary-600 hover:underline">
          Back to size guides
        </Link>
        <Link href="/size-guide" className="text-sm text-primary-600 hover:underline">
          View on storefront
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="rounded-xl border bg-white p-4 space-y-4">
            <h2 className="text-lg font-semibold">Guide Details</h2>
            <Input
              label="Title"
              value={guide.title}
              onChange={(e) => setGuide({ ...guide, title: e.target.value })}
            />
            <Input
              label="Subtitle"
              value={guide.subtitle || ''}
              onChange={(e) => setGuide({ ...guide, subtitle: e.target.value })}
            />
            <Input
              label="Display order"
              type="number"
              value={guide.display_order}
              onChange={(e) =>
                setGuide({ ...guide, display_order: Number(e.target.value) || 0 })
              }
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={guide.is_active}
                onChange={(e) => setGuide({ ...guide, is_active: e.target.checked })}
                className="accent-primary-600"
              />
              <span className="text-sm text-gray-700">Active on storefront</span>
            </label>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Show for categories</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                      className="accent-primary-600"
                    />
                    {category.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                If none are selected, this guide appears on all products and the size guide page.
              </p>
            </div>

            <Button onClick={saveGuide} loading={savingGuide}>
              <Save className="h-4 w-4" />
              Save Guide
            </Button>
          </div>

          <div className="rounded-xl border bg-white p-4 space-y-4">
            <h2 className="text-lg font-semibold">Rows</h2>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    {['Size', 'Chest', 'Shoulder', 'Length', 'Ideal Fit', 'Order', ''].map(
                      (heading) => (
                        <th key={heading} className="border px-2 py-2 text-left">
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      {(['size_label', 'chest', 'shoulder', 'length', 'ideal_fit'] as const).map(
                        (field) => (
                          <td key={field} className="border px-2 py-1">
                            <input
                              value={row[field]}
                              onChange={(e) => updateRowField(row.id, field, e.target.value)}
                              className="w-full min-w-[80px] rounded border px-2 py-1"
                            />
                          </td>
                        )
                      )}
                      <td className="border px-2 py-1">
                        <input
                          type="number"
                          value={row.display_order}
                          onChange={(e) =>
                            updateRowField(row.id, 'display_order', Number(e.target.value) || 0)
                          }
                          className="w-16 rounded border px-2 py-1"
                        />
                      </td>
                      <td className="border px-2 py-1">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            loading={savingRowId === row.id}
                            onClick={() => saveRow(row)}
                          >
                            Save
                          </Button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="New size"
                value={newRow.size_label}
                onChange={(e) => setNewRow({ ...newRow, size_label: e.target.value })}
              />
              <Input
                label="Chest"
                value={newRow.chest}
                onChange={(e) => setNewRow({ ...newRow, chest: e.target.value })}
              />
              <Input
                label="Shoulder"
                value={newRow.shoulder}
                onChange={(e) => setNewRow({ ...newRow, shoulder: e.target.value })}
              />
              <Input
                label="Length"
                value={newRow.length}
                onChange={(e) => setNewRow({ ...newRow, length: e.target.value })}
              />
              <Input
                label="Ideal fit"
                value={newRow.ideal_fit}
                onChange={(e) => setNewRow({ ...newRow, ideal_fit: e.target.value })}
                className="sm:col-span-2"
              />
            </div>

            <Button onClick={addRow}>
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Preview</h2>
          <SizeGuideSection guide={previewGuide} index={guide.display_order || 1} />
        </div>
      </div>
    </div>
  )
}
