import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser()
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const { orderId, trackingNumber } = await req.json()

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        tracking_number: trackingNumber || null,
        shipped_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed' },
      { status: 500 }
    )
  }
}
