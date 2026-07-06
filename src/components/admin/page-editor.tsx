'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { prepareCmsHtmlForRender, type CmsPage } from '@/lib/cms'
import toast from 'react-hot-toast'

const CKEDITOR_UPLOAD_URL = '/api/upload/ckeditor'

class CmsUploadAdapter {
  private loader: { file: Promise<File | null> }

  constructor(loader: { file: Promise<File | null> }) {
    this.loader = loader
  }

  upload() {
    return this.loader.file.then((file) => {
      if (!file) {
        return Promise.reject(new Error('No file selected'))
      }

      const formData = new FormData()
      formData.append('upload', file)

      return fetch(CKEDITOR_UPLOAD_URL, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }).then(async (response) => {
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(data?.error || 'Image upload failed')
        }

        if (!data?.url) {
          throw new Error('Image upload failed')
        }

        return { default: data.url as string }
      })
    })
  }

  abort() {}
}

function CmsUploadAdapterPlugin(editor: {
  plugins: {
    get: (name: string) => {
      createUploadAdapter: (loader: { file: Promise<File | null> }) => CmsUploadAdapter
    }
  }
}) {
  editor.plugins.get('FileRepository').createUploadAdapter = (loader) => {
    return new CmsUploadAdapter(loader)
  }
}

CmsUploadAdapterPlugin.pluginName = 'CmsUploadAdapterPlugin'

const CMS_EDITOR_CONFIG = {
  extraPlugins: [CmsUploadAdapterPlugin],
  toolbar: [
    'heading',
    '|',
    'bold',
    'italic',
    'link',
    'bulletedList',
    'numberedList',
    'uploadImage',
    'mediaEmbed',
    '|',
    'undo',
    'redo',
  ],
  mediaEmbed: {
    previewsInData: true,
  },
  image: {
    toolbar: [
      'imageTextAlternative',
      '|',
      'imageStyle:inline',
      'imageStyle:block',
      'imageStyle:side',
    ],
  },
}

const CKEditor = dynamic(
  () => import('@ckeditor/ckeditor5-react').then((mod) => mod.CKEditor),
  { ssr: false }
)

interface PageEditorProps {
  page: CmsPage
}

export default function PageEditor({ page }: PageEditorProps) {
  const router = useRouter()
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
    }

    if (isBlog) {
      payload.title = title.trim()
      payload.excerpt = excerpt.trim() || null
      payload.is_published = isPublished
    }

    try {
      const res = await fetch(`/api/admin/pages/${page.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(data?.error || 'Failed to save')
        return
      }

      toast.success('Updated successfully')
      router.refresh()
    } catch {
      toast.error('Failed to save')
    } finally {
      setLoading(false)
    }
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
          Use the image button to upload JPG, PNG, or WebP files (max 10MB). For Google Maps,
          use media embed and paste the maps embed URL (starts with
          https://www.google.com/maps/embed).
        </p>
        <CKEditor
          editor={editor}
          data={content}
          onChange={(_event: unknown, editorInstance: { getData: () => string }) => {
            setContent(editorInstance.getData())
          }}
          config={CMS_EDITOR_CONFIG}
        />
      </div>

      <Button onClick={handleSave} loading={loading}>
        Save
      </Button>
    </div>
  )
}
