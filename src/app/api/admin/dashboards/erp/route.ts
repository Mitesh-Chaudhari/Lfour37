import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/admin-auth'
import {
  buildFinanceErpDashboard,
  buildPosErpDashboard,
  buildSalesErpDashboard,
  resolveDatePreset,
} from '@/lib/erp-dashboards'

export async function GET(req: NextRequest) {
  const staff = await requirePermission('dashboards')
  if (!staff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const view = (searchParams.get('view') || 'sales') as
    | 'sales'
    | 'pos'
    | 'finance'
  const preset = searchParams.get('preset') || '90d'
  const customFrom = searchParams.get('from') || undefined
  const customTo = searchParams.get('to') || undefined

  const { range, previous, label } = resolveDatePreset(
    preset,
    customFrom,
    customTo
  )

  try {
    const db = createAdminClient()
    if (view === 'pos') {
      const data = await buildPosErpDashboard(db, range, previous)
      return NextResponse.json({ ...data, preset, label })
    }
    if (view === 'finance') {
      const data = await buildFinanceErpDashboard(db, range, previous)
      return NextResponse.json({ ...data, preset, label })
    }
    const data = await buildSalesErpDashboard(db, range, previous)
    return NextResponse.json({ ...data, preset, label })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load dashboard' },
      { status: 500 }
    )
  }
}
