export type CmsPageType = 'page' | 'blog'

export interface CmsPage {
  id: string
  title: string
  slug: string
  content: string | null
  page_type: CmsPageType
  excerpt: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatCmsDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
