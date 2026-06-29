import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prepareCmsHtmlForRender } from '@/lib/cms'

interface Props {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('pages')
    .select('title')
    .eq('slug', slug)
    .eq('page_type', 'page')
    .eq('is_published', true)
    .single()

  if (!page) return { title: 'Page Not Found' }

  return { title: page.title }
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params

  const supabase = await createClient()

  const { data: page } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('page_type', 'page')
    .eq('is_published', true)
    .single()

  if (!page) {
    notFound()
  }

  return (
    <>
      <div className="px-4 py-3 bg-primary-400">
        <h1 className="text-3xl font-bold container mx-auto max-w-4xl">{page.title}</h1>
      </div>
      <div className="container mx-auto px-4 py-5 max-w-4xl">
        <div
          className="prose prose-gray max-w-none [&_iframe]:my-6 [&_iframe]:w-full [&_iframe]:min-h-[400px] [&_iframe]:rounded-xl [&_iframe]:border [&_iframe]:border-gray-200"
          dangerouslySetInnerHTML={{
            __html: prepareCmsHtmlForRender(page.content || ''),
          }}
        />
      </div>
    </>
  )
}
