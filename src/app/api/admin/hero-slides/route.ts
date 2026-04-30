import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabaseAdmin = createAdminClient()
  const supabaseUser = await createClient()

  // ✅ Auth check
  const { data: { user } } = await supabaseUser.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ✅ Role check
  const { data: userData } = await supabaseUser
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'super_admin'].includes(userData?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const slides = await req.json()

  // ✅ Extract IDs from frontend
  const incomingIds = slides.map((s: any) => s.id).filter(Boolean)

  // 🔥 STEP 1: DELETE removed slides
  if (incomingIds.length > 0) {
    await supabaseAdmin
      .from('hero_slides')
      .delete()
      .not('id', 'in', `(${incomingIds.map((id: any) => `"${id}"`).join(',')})`)
  } else {
    // if all removed → delete all
    await supabaseAdmin.from('hero_slides').delete().neq('id', '')
  }

  if (!slides || slides.length === 0) {
    return NextResponse.json({ success: true })
  }

  // 🔥 STEP 2: CLEAN payload
  const cleanSlides = slides.map(({ created_at, ...rest }: any) => rest)

  // 🔥 STEP 3: UPSERT
  const { error } = await supabaseAdmin
    .from('hero_slides')
    .upsert(cleanSlides, { onConflict: 'id' })

  if (error) {
    console.error(error)
    return NextResponse.json({ error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}