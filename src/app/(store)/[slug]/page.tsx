import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

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
          className="prose prose-gray max-w-none"
          dangerouslySetInnerHTML={{
            __html: page.content || '',
          }}
        />
      </div>
    </>
  )
}
