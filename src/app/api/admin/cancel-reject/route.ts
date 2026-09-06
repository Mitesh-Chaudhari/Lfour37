import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  const adminUser = await requireAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { item_id } = await req.json()

  if (!item_id) {
    return NextResponse.json({ error: 'Missing item_id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('order_items')
    .update({
      status: 'active',
      cancel_reason: null,
      cancelled_at: null,
    })
    .eq('id', item_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
