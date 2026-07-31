import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/whatsapp'
import logger from '@/lib/logger'

const itemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  name: z.string().min(1).max(300),
  slug: z.string().min(1).max(300),
  quantity: z.number().int().positive().max(100),
  image_url: z.string().nullable().optional(),
  price: z.number().min(0),
})

const syncSchema = z.object({
  items: z.array(itemSchema).max(50),
})

function isMissingAbandonedCartsTable(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST205' ||
    Boolean(error.message?.includes('public.abandoned_carts'))
  )
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { supabase, user: null, profile: null }

  const { data: profile } = await supabase
    .from('users')
    .select('id, phone')
    .eq('id', user.id)
    .single()

  return { supabase, user, profile }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, profile } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = syncSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const items = parsed.data.items.map((item) => ({
      ...item,
      image_url: item.image_url || null,
    }))

    // Empty cart → mark recovered / clear active abandoned cart
    if (items.length === 0) {
      const { error: clearError } = await supabase
        .from('abandoned_carts')
        .update({
          items: [],
          recovered_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .is('recovered_at', null)

      if (isMissingAbandonedCartsTable(clearError)) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'table_missing',
        })
      }

      return NextResponse.json({ success: true, recovered: true })
    }

    const rawPhone = profile?.phone?.trim()
    if (!rawPhone) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'no_phone',
      })
    }

    const phone = normalizePhone(rawPhone)
    const now = new Date().toISOString()

    const { data: existing, error: existingError } = await supabase
      .from('abandoned_carts')
      .select('id, recovered_at, reminder_sent_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (isMissingAbandonedCartsTable(existingError)) {
      logger.warn(
        'Abandoned cart sync skipped — run migration 023_abandoned_carts.sql',
        { userId: user.id }
      )
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'table_missing',
      })
    }

    const isNewSession = !existing || Boolean(existing.recovered_at)

    const payload = {
      user_id: user.id,
      phone,
      items,
      cart_updated_at: now,
      recovered_at: null,
      reminder_sent_at: isNewSession ? null : existing?.reminder_sent_at ?? null,
      updated_at: now,
    }

    const { error } = await supabase.from('abandoned_carts').upsert(payload, {
      onConflict: 'user_id',
    })

    if (error) {
      if (isMissingAbandonedCartsTable(error)) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'table_missing',
        })
      }
      logger.error('Abandoned cart sync failed', { error, userId: user.id })
      return NextResponse.json({ error: 'Failed to sync cart' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Abandoned cart sync route failed', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { supabase, user } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('abandoned_carts')
      .update({
        items: [],
        recovered_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .is('recovered_at', null)

    if (isMissingAbandonedCartsTable(error)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'table_missing',
      })
    }

    return NextResponse.json({ success: true, recovered: true })
  } catch (error) {
    logger.error('Abandoned cart recover route failed', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
