import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createClient,
} from '@/lib/supabase/server'

export async function POST(
  req: NextRequest
) {

  try {

    const body =
      await req.json()

    console.log(
      'WHATSAPP WEBHOOK:',
      body
    )

    const supabase =
      await createClient()

    await supabase
      .from('whatsapp_logs')
      .insert({
        phone:
          body.phone,

        template_name:
          body.template,

        response: body,

        status:
          body.status ||
          'delivered',
      })

    return NextResponse.json({
      success: true,
    })

  } catch (err) {

    console.error(err)

    return NextResponse.json(
      {
        error:
          'Webhook failed',
      },
      { status: 500 }
    )
  }
}