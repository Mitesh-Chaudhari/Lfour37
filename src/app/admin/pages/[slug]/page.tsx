import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PageEditor from '@/components/admin/page-editor'
import type { CmsPage } from '@/lib/cms'

interface Props {
  params: Promise<{
    slug: string
  }>
}

export default async function AdminPageEditor({ params }: Props) {
  const { slug } = await params

  const supabase = await createClient()

  const { data: page } = await supabase.from('pages').select('*').eq('slug', slug).single()

  if (!page) {
    notFound()
  }

  const cmsPage = page as CmsPage

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{page.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {cmsPage.page_type === 'blog' ? (
              <>
                Blog post ·{' '}
                <Link href={`/blogs/${page.slug}`} className="text-primary-600 hover:underline">
                  View on site
                </Link>
              </>
            ) : (
              <>
                Content page ·{' '}
                <Link href={`/${page.slug}`} className="text-primary-600 hover:underline">
                  View on site
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href="/admin/pages" className="text-sm text-primary-600 hover:underline">
          Back to pages
        </Link>
      </div>

      <PageEditor page={cmsPage} />
    </div>
  )
}
