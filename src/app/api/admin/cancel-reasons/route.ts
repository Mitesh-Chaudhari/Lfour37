import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/admin-auth'

export async function GET() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('cancel_reasons')
    .select('*')
    .eq('is_active', true)
    .order('created_at')

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const adminUser = await requireAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { label } = await req.json()

  if (!label) {
    return NextResponse.json({ error: 'Label required' }, { status: 400 })
  }

  await supabase.from('cancel_reasons').insert({ label })

  return NextResponse.json({ success: true })
}
