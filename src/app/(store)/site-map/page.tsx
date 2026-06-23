import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sitemap',
  description: 'Browse all pages, categories, and content on Lfour37.',
}

export default async function SitemapPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: pages }, { data: blogs }, { data: products }] =
    await Promise.all([
      supabase
        .from('categories')
        .select('name, slug')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('pages')
        .select('title, slug')
        .eq('page_type', 'page')
        .eq('is_published', true)
        .order('title'),
      supabase
        .from('pages')
        .select('title, slug')
        .eq('page_type', 'blog')
        .eq('is_published', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('name, slug')
        .eq('status', 'active')
        .order('name'),
    ])

  const mainLinks = [
    { label: 'Home', href: '/' },
    { label: 'Size Guide', href: '/size-guide' },
    { label: 'All Products', href: '/products' },
    { label: 'Blog', href: '/blogs' },
    { label: 'Custom Printing', href: '/custom-printing' },
    { label: 'Cart', href: '/cart' },
    { label: 'Wishlist', href: '/wishlist' },
    { label: 'Login', href: '/login' },
    { label: 'Register', href: '/register' },
  ]

  const accountLinks = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My Orders', href: '/dashboard/orders' },
    { label: 'Profile', href: '/dashboard/profile' },
    { label: 'Addresses', href: '/dashboard/addresses' },
    { label: 'Invoices', href: '/dashboard/invoices' },
  ]

  return (
    <>
      <div className="px-4 py-3 bg-primary-400">
        <h1 className="text-3xl font-bold container mx-auto max-w-5xl">Sitemap</h1>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Main</h2>
            <ul className="space-y-2">
              {mainLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-primary-600 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Account</h2>
            <ul className="space-y-2">
              {accountLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-primary-600 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Company</h2>
            <ul className="space-y-2">
              {(pages || []).map((page) => (
                <li key={page.slug}>
                  <Link href={`/${page.slug}`} className="text-primary-600 hover:underline">
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Categories</h2>
            <ul className="space-y-2">
              {(categories || []).map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/products?category=${category.slug}`}
                    className="text-primary-600 hover:underline"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Blog</h2>
            <ul className="space-y-2">
              <li>
                <Link href="/blogs" className="text-primary-600 hover:underline">
                  All Blog Posts
                </Link>
              </li>
              {(blogs || []).map((post) => (
                <li key={post.slug}>
                  <Link href={`/blogs/${post.slug}`} className="text-primary-600 hover:underline">
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="md:col-span-2 lg:col-span-3">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Products</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(products || []).map((product) => (
                <li key={product.slug}>
                  <Link
                    href={`/products/${product.slug}`}
                    className="text-primary-600 hover:underline"
                  >
                    {product.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
