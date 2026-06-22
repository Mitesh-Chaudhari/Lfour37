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

    const {
      phone,
      otp,
    } = await req.json()

    const { data } =
      await supabase
        .from('phone_otps')
        .select('*')
        .eq('phone', phone)
        .eq('otp', otp)
        .eq('verified', false)
        .order(
          'created_at',
          {
            ascending: false,
          }
        )
        .limit(1)
        .single()

    if (!data) {
      return NextResponse.json(
        {
          error:
            'Invalid OTP',
        },
        {
          status: 400,
        }
      )
    }

    if (
      new Date(
        data.expires_at
      ) < new Date()
    ) {
      return NextResponse.json(
        {
          error:
            'OTP expired',
        },
        {
          status: 400,
        }
      )
    }

    await supabase
      .from('phone_otps')
      .update({
        verified: true,
      })
      .eq('id', data.id)

    await supabase
      .from('verified_phones')
      .upsert({
        phone,
        verified_at:
          new Date().toISOString(),
      })

    return NextResponse.json({
      success: true,
    })

  } catch (err: any) {

    return NextResponse.json(
      {
        error:
          err.message,
      },
      {
        status: 500,
      }
    )
  }
}