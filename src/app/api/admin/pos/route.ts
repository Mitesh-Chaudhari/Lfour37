import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getOpenPosSession,
  lookupVariantByBarcode,
  requireAdminUser,
} from '@/lib/inventory'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import {
  ADMIN_BRAND_COOKIE,
  ADMIN_BRAND_ALL,
  LFOUR37_BRAND_ID,
} from '@/lib/organization'

async function resolveAdminBrandId(): Promise<string> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value || value === ADMIN_BRAND_ALL) return LFOUR37_BRAND_ID
  return value
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const barcode = request.nextUrl.searchParams.get('barcode') || ''
  if (!barcode.trim()) {
    return NextResponse.json({ error: 'barcode required' }, { status: 400 })
  }

  try {
    const brandId = await resolveAdminBrandId()
    const locationId =
      request.nextUrl.searchParams.get('location_id') || undefined
    const item = await lookupVariantByBarcode(barcode, brandId, locationId)
    if (!item) {
      return NextResponse.json({ error: 'No product found for barcode' }, { status: 404 })
    }
    if (item.stock <= 0) {
      return NextResponse.json(
        { error: 'Out of stock', item },
        { status: 409 }
      )
    }
    return NextResponse.json({ item })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lookup failed' },
      { status: 500 }
    )
  }
}

const openSessionSchema = z.object({
  location_id: z.string().uuid(),
  brand_id: z.string().uuid().optional(),
  opening_float: z.number().min(0).optional().default(0),
})

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const action = body?.action as string | undefined

  const db = createAdminClient()

  if (action === 'open_session') {
    const parsed = openSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const brandId = parsed.data.brand_id || (await resolveAdminBrandId())
    const existing = await getOpenPosSession(parsed.data.location_id)
    if (existing) {
      return NextResponse.json({ session: existing })
    }

    const { data: location } = await db
      .from('locations')
      .select('id, company_id, brand_id')
      .eq('id', parsed.data.location_id)
      .single()

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const { data, error } = await db
      .from('pos_sessions')
      .insert({
        company_id: location.company_id,
        brand_id: location.brand_id || brandId,
        location_id: location.id,
        opened_by: admin.id,
        opening_float: parsed.data.opening_float,
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ session: data })
  }

  if (action === 'close_session') {
    const sessionId = body?.session_id as string | undefined
    const countedCash = Number(body?.counted_cash || 0)
    const notes = (body?.notes as string) || null
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    }

    const { data: session } = await db
      .from('pos_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('status', 'open')
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ error: 'Open session not found' }, { status: 404 })
    }

    const { data: sales } = await db
      .from('pos_sales')
      .select('amount_cash, amount_upi, amount_card, total')
      .eq('session_id', sessionId)
      .eq('status', 'completed')

    const cashSales = (sales || []).reduce(
      (sum, s) => sum + Number(s.amount_cash || 0),
      0
    )
    const expectedCash = Number(session.opening_float || 0) + cashSales

    const { data: closed, error } = await db
      .from('pos_sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: admin.id,
        expected_cash: expectedCash,
        counted_cash: countedCash,
        notes,
      })
      .eq('id', sessionId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const summary = {
      sales_count: (sales || []).length,
      total_sales: (sales || []).reduce((s, r) => s + Number(r.total || 0), 0),
      cash: cashSales,
      upi: (sales || []).reduce((s, r) => s + Number(r.amount_upi || 0), 0),
      card: (sales || []).reduce((s, r) => s + Number(r.amount_card || 0), 0),
      opening_float: Number(session.opening_float || 0),
      expected_cash: expectedCash,
      counted_cash: countedCash,
    }

    return NextResponse.json({ session: closed, summary })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
