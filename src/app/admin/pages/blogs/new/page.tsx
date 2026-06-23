'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { slugifyTitle } from '@/lib/cms'
import toast from 'react-hot-toast'

export default function NewBlogPostPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [loading, setLoading] = useState(false)

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!slug || slug === slugifyTitle(title)) {
      setSlug(slugifyTitle(value))
    }
  }

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    const finalSlug = slugifyTitle(slug || title)
    if (!finalSlug) {
      toast.error('Slug is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: finalSlug,
          excerpt: excerpt.trim() || null,
          page_type: 'blog',
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || 'Failed to create blog post')
        return
      }

      toast.success('Blog post created')
      router.push(`/admin/pages/${finalSlug}`)
    } catch {
      toast.error('Failed to create blog post')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">New Blog Post</h1>
        <p className="text-sm text-gray-600 mt-1">
          Create a blog post, then add the full content in the editor.
        </p>
      </div>

      <div className="space-y-4 bg-white border rounded-xl p-6">
        <Input
          label="Title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Summer style guide"
        />

        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(slugifyTitle(e.target.value))}
          placeholder="summer-style-guide"
          helperText="Used in the URL: /blogs/your-slug"
        />

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Excerpt</label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={3}
            placeholder="Short summary shown on the blog listing page"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <Button onClick={handleCreate} loading={loading}>
          Create Blog Post
        </Button>
      </div>
    </div>
  )
}
