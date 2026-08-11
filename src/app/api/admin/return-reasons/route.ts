import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ReasonKind = 'return' | 'exchange'

function parseKind(value: unknown): ReasonKind | null {
  if (value === 'return' || value === 'exchange') return value
  return null
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { supabase }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const kind = parseKind(req.nextUrl.searchParams.get('kind'))
  const includeInactive =
    req.nextUrl.searchParams.get('includeInactive') === 'true'

  let query = supabase
    .from('return_reasons')
    .select('*')
    .order('created_at', { ascending: true })

  if (kind) query = query.eq('kind', kind)
  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({}))
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  const kind = parseKind(body.kind)

  if (!label) {
    return NextResponse.json({ error: 'Label required' }, { status: 400 })
  }
  if (!kind) {
    return NextResponse.json(
      { error: 'kind must be return or exchange' },
      { status: 400 }
    )
  }

  const { error } = await auth.supabase.from('return_reasons').insert({
    label,
    kind,
    is_active: true,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
