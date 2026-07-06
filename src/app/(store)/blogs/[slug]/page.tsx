import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatCmsDate, prepareCmsHtmlForRender } from '@/lib/cms'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('pages')
    .select('title, excerpt')
    .eq('slug', slug)
    .eq('page_type', 'blog')
    .eq('is_published', true)
    .single()

  if (!post) return { title: 'Blog Post Not Found' }

  return {
    title: post.title,
    description: post.excerpt || `Read ${post.title} on the Lfour37 blog.`,
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .eq('page_type', 'blog')
    .eq('is_published', true)
    .single()

  if (!post) notFound()

  return (
    <>
      <div className="px-4 py-3 bg-primary-400">
        <div className="container mx-auto max-w-4xl">
          <Link href="/blogs" className="text-sm text-gray-800 hover:underline mb-2 inline-block">
            ← Back to Blogs
          </Link>
          <h1 className="text-3xl font-bold">{post.title}</h1>
          <p className="text-sm text-gray-700 mt-2">{formatCmsDate(post.created_at)}</p>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div
          className="prose prose-gray max-w-none [&_iframe]:my-6 [&_iframe]:w-full [&_iframe]:min-h-[400px] [&_iframe]:rounded-xl [&_iframe]:border [&_iframe]:border-gray-200"
          dangerouslySetInnerHTML={{
            __html: prepareCmsHtmlForRender(post.content || ''),
          }}
        />
      </div>
    </>
  )
}
