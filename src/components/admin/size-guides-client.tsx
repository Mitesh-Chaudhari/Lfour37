'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SizeGuide } from '@/lib/size-guides'

interface SizeGuidesClientProps {
  guides: SizeGuide[]
}

export function SizeGuidesClient({ guides: initialGuides }: SizeGuidesClientProps) {
  const router = useRouter()
  const [guides, setGuides] = useState(initialGuides)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [loading, setLoading] = useState(false)

  const createGuide = async () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/size-guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          display_order: guides.length + 1,
        }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(data?.error || 'Failed to create size guide')
        return
      }

      toast.success('Size guide created')
      router.push(`/admin/size-guides/${data.id}`)
    } catch {
      toast.error('Failed to create size guide')
    } finally {
      setLoading(false)
    }
  }

  const deleteGuide = async (guide: SizeGuide) => {
    if (!confirm(`Delete "${guide.title}"?`)) return

    const res = await fetch(`/api/admin/size-guides/${guide.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      toast.error(data?.error || 'Failed to delete size guide')
      return
    }

    setGuides((current) => current.filter((item) => item.id !== guide.id))
    toast.success('Size guide deleted')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-600">
          Manage measurement tables shown on the size guide page and product pages.
        </p>
        <Button onClick={() => setShowCreate((value) => !value)}>
          <Plus className="h-4 w-4" />
          New Size Guide
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            label="Subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="T-Shirts, Oversized, Shirts, Hoodies"
          />
          <Button onClick={createGuide} loading={loading}>
            Create Size Guide
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {guides.map((guide) => (
          <div
            key={guide.id}
            className="flex items-center justify-between gap-3 p-3 manage-page-link"
          >
            <Link href={`/admin/size-guides/${guide.id}`} className="flex-1">
              <p className="font-medium">{guide.title}</p>
              <p className="text-xs text-gray-500">
                {guide.subtitle || 'No subtitle'} · {guide.is_active ? 'Active' : 'Hidden'} ·{' '}
                {(guide.rows || []).length} rows
              </p>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => deleteGuide(guide)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                aria-label={`Delete ${guide.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <Link href={`/admin/size-guides/${guide.id}`}>
                <ChevronRight />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
