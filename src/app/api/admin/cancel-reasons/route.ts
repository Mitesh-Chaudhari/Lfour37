import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const supabase = await createClient()
  const { label } = await req.json()

  if (!label) {
    return NextResponse.json({ error: 'Label required' }, { status: 400 })
  }

  await supabase.from('cancel_reasons').insert({ label })

  return NextResponse.json({ success: true })
}