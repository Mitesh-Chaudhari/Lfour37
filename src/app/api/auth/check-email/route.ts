import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthUserByEmail } from '@/lib/auth-users'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ exists: false })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabase = createAdminClient()

    const { data: profileRows } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1)

    if (profileRows?.length) {
      return NextResponse.json({ exists: true })
    }

    const authUser = await getAuthUserByEmail(normalizedEmail)

    return NextResponse.json({ exists: Boolean(authUser) })
  } catch {
    return NextResponse.json({ exists: false }, { status: 500 })
  }
}