import {
  NextRequest,
  NextResponse,
} from 'next/server'

import { createClient }
from '@/lib/supabase/server'

import {
  sendWhatsAppTemplate,
} from '@/lib/whatsapp'

export async function POST(
  req: NextRequest
) {
  try {

    const supabase =
      await createClient()

    const {
      orderId,
      trackingNumber,
    } = await req.json()

    if (!orderId) {
      return NextResponse.json(
        {
          error:
            'Order ID required',
        },
        { status: 400 }
      )
    }

    // UPDATE ORDER
    const { error } =
      await supabase
        .from('orders')
        .update({
          status: 'shipped',

          tracking_number:
            trackingNumber || null,

          shipped_at:
            new Date().toISOString(),
        })
        .eq('id', orderId)

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        { status: 500 }
      )
    }

    // FETCH ORDER
    const { data: order } =
      await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          shipping_address,
          user_id
        `)
        .eq('id', orderId)
        .single()

    // SEND WHATSAPP
    try {

      const ordersUrl =
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/orders`

      await sendWhatsAppTemplate({
        phone:
          order?.shipping_address
            ?.phone,

        userId:
          order?.user_id,

        orderId:
          order?.id,

        templateName:
          'order_shipped',

        variables: [
          order?.order_number || '',

          trackingNumber || 'N/A',

          ordersUrl,
        ],
      })

    } catch (err) {

      console.error(
        'Shipped WhatsApp Failed',
        err
      )
    }

    return NextResponse.json({
      success: true,
    })

  } catch (err: any) {

    return NextResponse.json(
      {
        error:
          err.message,
      },
      { status: 500 }
    )
  }
}