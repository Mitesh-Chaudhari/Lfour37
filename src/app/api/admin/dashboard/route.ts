import { NextRequest, NextResponse } from 'next/server'
import {
  buildAdminDashboard,
  resolveDatePreset,
} from '@/lib/admin-dashboard'
import { requirePermission } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const staff = await requirePermission('dashboards')
  if (!staff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
    const supabase = createAdminClient()
    const data = await buildAdminDashboard(supabase, range, previous)
    return NextResponse.json({ ...data, preset, label })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load dashboard' },
      { status: 500 }
    )
  }
}
