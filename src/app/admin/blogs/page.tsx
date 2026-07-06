import Link from 'next/link'
import { Plus, ChevronRight, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatCmsDate } from '@/lib/cms'
import { Badge } from '@/components/ui/badge'

export default async function AdminBlogsPage() {
  const supabase = await createClient()

  const { data: blogs } = await supabase
    .from('pages')
    .select('id, title, slug, excerpt, is_published, created_at, updated_at')
    .eq('page_type', 'blog')
    .order('updated_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Blog Posts</h1>
          <p className="text-gray-500 mt-1">
            Create and publish blog posts shown at{' '}
            <Link href="/blogs" className="text-purple-600 hover:underline">
              /blogs
            </Link>
          </p>
        </div>
        <Link
          href="/admin/blogs/new"
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Blog Post
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {!blogs?.length ? (
          <div className="p-10 text-center">
            <p className="text-gray-600 mb-4">No blog posts yet.</p>
            <Link
              href="/admin/blogs/new"
              className="inline-flex items-center gap-2 text-sm font-medium text-purple-600 hover:underline"
            >
              <Plus className="h-4 w-4" />
              Create your first blog post
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {blogs.map((blog) => (
              <div
                key={blog.id}
                className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900 truncate">{blog.title}</p>
                    <Badge variant={blog.is_published ? 'default' : 'secondary'}>
                      {blog.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  {blog.excerpt ? (
                    <p className="text-sm text-gray-500 line-clamp-1">{blog.excerpt}</p>
                  ) : null}
                  <p className="text-xs text-gray-400 mt-1">
                    Updated {formatCmsDate(blog.updated_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {blog.is_published ? (
                    <Link
                      href={`/blogs/${blog.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </Link>
                  ) : null}
                  <Link
                    href={`/admin/blogs/${blog.slug}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                  >
                    Edit
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
