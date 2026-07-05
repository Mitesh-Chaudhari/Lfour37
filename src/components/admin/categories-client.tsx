'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Edit2, ChevronRight, GripVertical } from 'lucide-react'
import { Category } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

const categorySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens'),
  description: z.string().max(500).optional(),
  parent_id: z.string().optional(),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  seo_title: z.string().max(60).optional(),
  seo_description: z.string().max(160).optional(),
})

type CategoryFormData = z.infer<typeof categorySchema>

export function CategoriesClient({ categories: initialCategories }: { categories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema) as any,
    defaultValues: { sort_order: 0, is_active: true },
  })

  const nameValue = watch('name')

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const rootCategories = categories.filter((c) => !c.parent_id)
  const getChildren = (parentId: string) => categories.filter((c) => c.parent_id === parentId)

  const getCategoryPath = (
    category: Category
  ): string => {
    const parts = [category.name]
    let current =
      category.parent_id
    while (current) {
      const parent =
        categories.find(
          (c) =>
            c.id === current
        )
      if (!parent) break
      parts.unshift(
        parent.name
      )
      current =
        parent.parent_id
    }
    return parts.join(
      ' → '
    )
  }

  const startEdit = (cat: Category) => {
    setEditingId(cat.id)
    setShowForm(true)
    setValue('name', cat.name)
    setValue('slug', cat.slug)
    setValue('description', cat.description || '')
    setValue('parent_id', cat.parent_id || '')
    setValue('sort_order', cat.sort_order)
    setValue('is_active', cat.is_active)
    setValue('seo_title', cat.seo_title || '')
    setValue('seo_description', cat.seo_description || '')
  }

  const onSubmit = async (data: CategoryFormData) => {
    setIsSaving(true)
    try {
      if (
        editingId &&
        data.parent_id === editingId
      ) {
        toast.error(
          'Category cannot be its own parent'
        )
        setIsSaving(false)
        return
      }
      if (
        editingId &&
        data.parent_id &&
        isDescendant(
          editingId,
          data.parent_id
        )
      ) {
        toast.error(
          'Cannot move category under one of its descendants'
        )

        setIsSaving(false)
        return
      }
      const payload = {
        ...data,
        parent_id: data.parent_id || null,
        description: data.description || null,
        seo_title: data.seo_title || null,
        seo_description: data.seo_description || null,
      }

      if (editingId) {
        const { data: updated, error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single()
        if (error) { toast.error(error.message); return }
        setCategories(categories.map((c) => c.id === editingId ? { ...c, ...updated } : c))
        toast.success('Category updated!')
      } else {
        const { data: created, error } = await supabase
          .from('categories')
          .insert(payload)
          .select()
          .single()
        if (error) { toast.error(error.message.includes('unique') ? 'Slug already exists' : error.message); return }
        setCategories([...categories, created])
        toast.success('Category created!')
      }

      reset()
      setShowForm(false)
      setEditingId(null)
    } catch {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }
  const isDescendant = (
    parentId: string,
    targetId: string
  ): boolean => {
    const children =
      categories.filter(
        (c) =>
          c.parent_id === parentId
      )

    for (const child of children) {
      if (
        child.id === targetId
      )
        return true

      if (
        isDescendant(
          child.id,
          targetId
        )
      )
        return true
    }

    return false
  }
  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('categories').update({ is_active: !current }).eq('id', id)
    if (!error) {
      setCategories(categories.map((c) => c.id === id ? { ...c, is_active: !current } : c))
      toast.success(current ? 'Category deactivated' : 'Category activated')
    }
  }

  const deleteCategory = async (id: string) => {
    const hasChildren = categories.some((c) => c.parent_id === id)
    if (hasChildren) { toast.error('Remove subcategories first'); return }
    if (!confirm('Delete this category?')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (!error) {
      setCategories(categories.filter((c) => c.id !== id))
      toast.success('Category deleted')
    } else {
      toast.error('Cannot delete — category may have products')
    }
  }

  const CategoryRow = ({ cat, depth = 0 }: { cat: Category; depth?: number }) => {
    const children = getChildren(cat.id)
    const isExpanded = expandedIds.has(cat.id)

    return (
      <>
        <tr className="hover:bg-gray-50">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
              {children.length > 0 && (
                <button
                  onClick={() => setExpandedIds((prev) => {
                    const next = new Set(prev)
                    next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id)
                    return next
                  })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
              )}
              {children.length === 0 && <div className="w-4" />}
              <GripVertical className="h-4 w-4 text-gray-300" />
              <span className="font-medium text-gray-900">{cat.name}</span>
            </div>
          </td>
          <td className="px-4 py-3 text-sm text-gray-500 font-mono">{cat.slug}</td>
          <td className="px-4 py-3 text-sm text-gray-500">{cat.sort_order}</td>
          <td className="px-4 py-3">
            <Badge variant={cat.is_active ? 'success' : 'secondary'}>
              {cat.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </td>
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => startEdit(cat)}
                className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => toggleActive(cat.id, cat.is_active)}
                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors text-xs"
              >
                {cat.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => deleteCategory(cat.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </td>
        </tr>
        {isExpanded && children.map((child) => (
          <CategoryRow key={child.id} cat={child} depth={depth + 1} />
        ))}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setShowForm(!showForm); setEditingId(null); reset() }}>
          <Plus className="h-4 w-4" /> Add Category
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Category' : 'New Category'}</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              error={errors.name?.message}
              {...register('name', {
                onChange: (e) => {
                  if (!editingId) setValue('slug', autoSlug(e.target.value))
                },
              })}
            />
            <Input
              label="Slug"
              error={errors.slug?.message}
              {...register('slug')}
            />
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Parent Category</label>
              <select
                {...register('parent_id')}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
              >
                <option value="">
                  None (Root Category)
                </option>

                {categories
                  .filter((cat) => {
                    if (!editingId) return true

                    // Cannot select itself
                    if (cat.id === editingId) {
                      return false
                    }

                    // Cannot select descendants
                    return !isDescendant(
                      editingId,
                      cat.id
                    )
                  })
                  .map((cat) => (
                    <option
                      key={cat.id}
                      value={cat.id}
                    >
                      {getCategoryPath(cat)}
                    </option>
                  ))}
              </select>
            </div>
            <Input
              label="Sort Order"
              type="number"
              min="0"
              {...register('sort_order', { valueAsNumber: true })}
            />
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                {...register('description')}
              />
            </div>
            <Input label="SEO Title (optional)" {...register('seo_title')} />
            <Input label="SEO Description (optional)" {...register('seo_description')} />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active_cat" {...register('is_active')} className="rounded accent-primary-600" />
              <label htmlFor="is_active_cat" className="text-sm font-medium text-gray-700">Active</label>
            </div>
            <div className="col-span-2 flex gap-3">
              <Button type="submit" loading={isSaving}>{editingId ? 'Update' : 'Create'} Category</Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); reset() }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Slug</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rootCategories.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} />
            ))}
          </tbody>
        </table>
        {categories.length === 0 && (
          <div className="py-12 text-center text-gray-400">No categories yet</div>
        )}
      </div>
    </div>
  )
}
