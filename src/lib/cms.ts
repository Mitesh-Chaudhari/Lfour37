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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** CKEditor Classic escapes pasted iframe markup as text — restore real embed HTML. */
export function prepareCmsHtmlForRender(html: string): string {
  if (!html) return ''

  return html.replace(
    /&lt;iframe([\s\S]*?)&lt;\/iframe&gt;/gi,
    (_match, attrs: string) => `<iframe${decodeHtmlEntities(attrs)}></iframe>`
  )
}
