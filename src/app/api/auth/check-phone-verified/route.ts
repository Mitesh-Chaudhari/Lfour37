import { NextRequest, NextResponse }
from 'next/server'

import { createAdminClient }
from '@/lib/supabase/server'

export async function POST(
  req: NextRequest
) {
  try {

    const supabase =
      await createAdminClient()

    const { phone } =
      await req.json()

    const { data } =
      await supabase
        .from('verified_phones')
        .select('phone')
        .eq('phone', phone)
        .single()

    return NextResponse.json({
      verified: !!data,
    })

  } catch {

    return NextResponse.json({
      verified: false,
    })
  }
}