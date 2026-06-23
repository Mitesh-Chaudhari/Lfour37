import { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.lfour37.com/'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  // Fetch all active products
  const { data: products } = await supabase
    .from('products')
    .select('slug, updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  // Fetch all active categories
  const { data: categories } = await supabase
    .from('categories')
    .select('slug, updated_at')
    .eq('is_active', true)

  const { data: cmsPages } = await supabase
    .from('pages')
    .select('slug, page_type, updated_at')
    .eq('is_published', true)

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/cart`,
      lastModified: new Date(),
      changeFrequency: 'never',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: 'never',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/register`,
      lastModified: new Date(),
      changeFrequency: 'never',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/blogs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/size-guide`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/site-map`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ]

  const productPages: MetadataRoute.Sitemap = (products || []).map((product) => ({
    url: `${BASE_URL}/products/${product.slug}`,
    lastModified: new Date(product.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const categoryPages: MetadataRoute.Sitemap = (categories || []).map((category) => ({
    url: `${BASE_URL}/products?category=${category.slug}`,
    lastModified: new Date(category.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const cmsContentPages: MetadataRoute.Sitemap = (cmsPages || [])
    .filter((page) => page.page_type === 'page')
    .map((page) => ({
      url: `${BASE_URL}/${page.slug}`,
      lastModified: new Date(page.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }))

  const blogPages: MetadataRoute.Sitemap = (cmsPages || [])
    .filter((page) => page.page_type === 'blog')
    .map((page) => ({
      url: `${BASE_URL}/blogs/${page.slug}`,
      lastModified: new Date(page.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))

  return [
    ...staticPages,
    ...productPages,
    ...categoryPages,
    ...cmsContentPages,
    ...blogPages,
  ]
}
