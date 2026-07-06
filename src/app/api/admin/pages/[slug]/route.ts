import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { prepareCmsHtmlForRender } from '@/lib/cms'
import { requireAdminUser } from '@/lib/admin-auth'
import logger from '@/lib/logger'

const updatePageSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  excerpt: z.string().max(500).nullable().optional(),
  content: z.string().optional(),
  is_published: z.boolean().optional(),
})

interface RouteContext {
  params: Promise<{ slug: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const adminUser = await requireAdminUser()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { slug } = await context.params
    const parsed = updatePageSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (parsed.data.title !== undefined) updates.title = parsed.data.title
    if (parsed.data.excerpt !== undefined) updates.excerpt = parsed.data.excerpt
    if (parsed.data.is_published !== undefined) {
      updates.is_published = parsed.data.is_published
    }
    if (parsed.data.content !== undefined) {
      updates.content = prepareCmsHtmlForRender(parsed.data.content)
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pages')
      .update(updates)
      .eq('slug', slug)
      .select('id, slug, title, page_type, is_published, updated_at')
      .single()

    if (error) {
      logger.error('Failed to update CMS page', { error, slug })
      return NextResponse.json({ error: 'Failed to update page' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, page: data })
  } catch (error) {
    logger.error('Update CMS page route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
