import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(req: NextRequest, { params }: any) {
  const supabase = await createClient()
  const { label } = await req.json()

  await supabase
    .from('cancel_reasons')
    .update({ label })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}

export async function DELETE(_: NextRequest, { params }: any) {
  const supabase = await createClient()

  await supabase
    .from('cancel_reasons')
    .update({ is_active: false })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}