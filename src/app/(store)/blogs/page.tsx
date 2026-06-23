import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCmsDate } from '@/lib/cms'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Style tips, brand updates, and news from Lfour37.',
}

export default async function BlogsPage() {
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('pages')
    .select('id, title, slug, excerpt, created_at, updated_at')
    .eq('page_type', 'blog')
    .eq('is_published', true)
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="px-4 py-3 bg-primary-400">
        <h1 className="text-3xl font-bold container mx-auto max-w-4xl">Blog</h1>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {!posts?.length ? (
          <p className="text-gray-600">No blog posts yet. Check back soon.</p>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-xl border border-gray-200 bg-white p-6 hover:border-primary-300 transition-colors"
              >
                <p className="text-sm text-gray-500 mb-2">
                  {formatCmsDate(post.created_at)}
                </p>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  <Link href={`/blogs/${post.slug}`} className="hover:text-primary-600">
                    {post.title}
                  </Link>
                </h2>
                {post.excerpt ? (
                  <p className="text-gray-600 mb-4">{post.excerpt}</p>
                ) : null}
                <Link
                  href={`/blogs/${post.slug}`}
                  className="text-sm font-medium text-primary-600 hover:underline"
                >
                  Read more
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
