'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { prepareCmsHtmlForRender, type CmsPage } from '@/lib/cms'
import toast from 'react-hot-toast'

const CKEditor = dynamic(
  () => import('@ckeditor/ckeditor5-react').then((mod) => mod.CKEditor),
  { ssr: false }
)

interface PageEditorProps {
  page: CmsPage
}

export default function PageEditor({ page }: PageEditorProps) {
  const supabase = createClient()
  const isBlog = page.page_type === 'blog'

  const [title, setTitle] = useState(page.title || '')
  const [excerpt, setExcerpt] = useState(page.excerpt || '')
  const [content, setContent] = useState(page.content || '')
  const [isPublished, setIsPublished] = useState(page.is_published ?? true)
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<any>(null)

  useEffect(() => {
    import('@ckeditor/ckeditor5-build-classic').then((mod) => {
      setEditor(() => mod.default)
    })
  }, [])

  const handleSave = async () => {
    if (!page?.id) {
      toast.error('Page ID missing')
      return
    }

    setLoading(true)

    const payload: Record<string, unknown> = {
      content: prepareCmsHtmlForRender(content),
      updated_at: new Date().toISOString(),
    }

    if (isBlog) {
      payload.title = title.trim()
      payload.excerpt = excerpt.trim() || null
      payload.is_published = isPublished
    }

    const { error } = await supabase.from('pages').update(payload).eq('id', page.id)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Updated successfully')
    }

    setLoading(false)
  }

  if (!editor) return <p>Loading editor...</p>
  if (!page?.id) return <p className="text-red-500">Page not found</p>

  return (
    <div className="space-y-4">
      {isBlog && (
        <div className="space-y-4 bg-white border rounded-lg p-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Excerpt</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="accent-primary-600"
            />
            <span className="text-sm text-gray-700">Published</span>
          </label>
          <p className="text-xs text-gray-500">
            Public URL: /blogs/{page.slug}
          </p>
        </div>
      )}

      <div className="bg-white border rounded-lg p-2">
        <p className="px-2 pt-2 text-xs text-gray-500">
          For Google Maps, use the media embed button and paste the maps embed URL
          (starts with https://www.google.com/maps/embed). Do not paste raw iframe HTML.
        </p>
        <CKEditor
          editor={editor}
          data={content}
          onChange={(_event: unknown, editorInstance: { getData: () => string }) => {
            setContent(editorInstance.getData())
          }}
          config={{
            toolbar: [
              'heading',
              '|',
              'bold',
              'italic',
              'link',
              'bulletedList',
              'numberedList',
              'mediaEmbed',
              '|',
              'undo',
              'redo',
            ],
            mediaEmbed: {
              previewsInData: true,
            },
          }}
        />
      </div>

      <Button onClick={handleSave} loading={loading}>
        Save
      </Button>
    </div>
  )
}
