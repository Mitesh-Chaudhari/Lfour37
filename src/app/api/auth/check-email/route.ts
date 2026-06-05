import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest
) {
  try {
    const { email } =
      await req.json()

    if (!email) {
      return NextResponse.json({
        exists: false,
      })
    }

    const supabase =
      await createAdminClient()

    const { data } =
      await supabase
        .from('users')
        .select('id')
        .eq(
          'email',
          email.toLowerCase()
        )
        .limit(1)

    return NextResponse.json({
      exists:
        !!data?.length,
    })

  } catch {
    return NextResponse.json(
      {
        exists: false,
      },
      {
        status: 500,
      }
    )
  }
}