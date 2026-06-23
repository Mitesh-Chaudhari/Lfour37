import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCmsDate } from '@/lib/cms'

const COMPANY_PAGES = [
  { slug: 'about', label: 'About Us' },
  { slug: 'careers', label: 'Careers' },
  { slug: 'store-near-me', label: 'Store Near Me' },
]

const POLICY_PAGES = [
  { slug: 'privacy-policy', label: 'Privacy Policy' },
  { slug: 'return-refund', label: 'Return Policy' },
  { slug: 'faq', label: 'FAQ' },
]

function PageLink({ slug, label }: { slug: string; label: string }) {
  return (
    <Link
      className="flex items-center justify-between gap-2 p-3 manage-page-link"
      href={`/admin/pages/${slug}`}
    >
      {label}
      <ChevronRight />
    </Link>
  )
}

export default async function AdminPages() {
  const supabase = await createClient()

  const { data: blogs } = await supabase
    .from('pages')
    .select('id, title, slug, is_published, updated_at')
    .eq('page_type', 'blog')
    .order('updated_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Content Pages</h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage company pages, policies, and blog posts shown on the storefront.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Company Pages</h2>
        <div className="flex flex-col gap-3">
          {COMPANY_PAGES.map((page) => (
            <PageLink key={page.slug} slug={page.slug} label={page.label} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Policies</h2>
        <div className="flex flex-col gap-3">
          {POLICY_PAGES.map((page) => (
            <PageLink key={page.slug} slug={page.slug} label={page.label} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Blog Posts</h2>
          <Link
            href="/admin/pages/blogs/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            New Blog Post
          </Link>
        </div>

        {!blogs?.length ? (
          <p className="text-sm text-gray-600">No blog posts yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {blogs.map((blog) => (
              <Link
                key={blog.id}
                className="flex items-center justify-between gap-2 p-3 manage-page-link"
                href={`/admin/pages/${blog.slug}`}
              >
                <div>
                  <p className="font-medium">{blog.title}</p>
                  <p className="text-xs text-gray-500">
                    {blog.is_published ? 'Published' : 'Draft'} · Updated{' '}
                    {formatCmsDate(blog.updated_at)}
                  </p>
                </div>
                <ChevronRight />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
