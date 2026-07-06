import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PageEditor from '@/components/admin/page-editor'
import type { CmsPage } from '@/lib/cms'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function AdminBlogEditorPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('page_type', 'blog')
    .single()

  if (!page) {
    notFound()
  }

  const cmsPage = page as CmsPage

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/admin/blogs" className="text-sm text-purple-600 hover:underline">
            ← Back to Blog Posts
          </Link>
          <h1 className="text-2xl font-bold mt-2">{page.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {page.is_published ? (
              <>
                Published ·{' '}
                <Link href={`/blogs/${page.slug}`} className="text-purple-600 hover:underline">
                  View on site
                </Link>
              </>
            ) : (
              'Draft — check Published below to show on the storefront'
            )}
          </p>
        </div>
      </div>

      <PageEditor page={cmsPage} />
    </div>
  )
}
