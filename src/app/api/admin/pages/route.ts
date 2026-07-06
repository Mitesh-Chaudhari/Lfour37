import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { slugifyTitle } from '@/lib/cms'
import { requireAdminUser } from '@/lib/admin-auth'
import logger from '@/lib/logger'

const createPageSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  excerpt: z.string().max(500).nullable().optional(),
  page_type: z.enum(['page', 'blog']).default('blog'),
})

async function requireAdmin() {
  return requireAdminUser()
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = createPageSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { title, excerpt, page_type } = parsed.data
    const slug = slugifyTitle(parsed.data.slug || title)

    if (!slug) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('pages')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }

    const { data, error } = await admin
      .from('pages')
      .insert({
        title,
        slug,
        excerpt: excerpt || null,
        page_type,
        content: page_type === 'blog' ? '<p>Start writing your blog post...</p>' : '',
        is_published: page_type === 'blog' ? false : true,
      })
      .select('slug')
      .single()

    if (error) {
      logger.error('Failed to create CMS page', { error })
      return NextResponse.json({ error: 'Failed to create page' }, { status: 500 })
    }

    return NextResponse.json({ success: true, slug: data.slug })
  } catch (error) {
    logger.error('Create CMS page route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
