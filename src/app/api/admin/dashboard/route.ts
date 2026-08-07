import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildAdminDashboard,
  resolveDatePreset,
} from '@/lib/admin-dashboard'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { supabase, user }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth && auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const preset = searchParams.get('preset') || '30d'
  const customFrom = searchParams.get('from') || undefined
  const customTo = searchParams.get('to') || undefined

  const { range, previous, label } = resolveDatePreset(
    preset,
    customFrom,
    customTo
  )

  try {
    const data = await buildAdminDashboard(auth.supabase!, range, previous)
    return NextResponse.json({ ...data, preset, label })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load dashboard' },
      { status: 500 }
    )
  }
}
