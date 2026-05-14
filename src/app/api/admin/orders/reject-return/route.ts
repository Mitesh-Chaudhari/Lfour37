import {
  NextRequest,
  NextResponse,
} from 'next/server'

import { createClient }
from '@/lib/supabase/server'

export async function POST(
  req: NextRequest
) {
  try {
    const supabase =
      await createClient()

    const { item_id } =
      await req.json()

    if (!item_id) {
      return NextResponse.json(
        {
          error:
            'Item ID is required',
        },
        { status: 400 }
      )
    }

    // GET ITEM

    const {
      data: item,
      error: itemError,
    } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id
      `)
      .eq('id', item_id)
      .single()

    if (itemError || !item) {
      return NextResponse.json(
        {
          error:
            'Item not found',
        },
        { status: 404 }
      )
    }

    // UPDATE ORDER ITEM

    const {
      error: updateError,
    } = await supabase
      .from('order_items')
      .update({
        return_status:
          'return_rejected',

        // revert back
        status: 'delivered',
      })
      .eq('id', item_id)

    if (updateError) {
      return NextResponse.json(
        {
          error:
            updateError.message,
        },
        { status: 500 }
      )
    }

    // UPDATE PARENT ORDER

    await supabase
      .from('orders')
      .update({
        status: 'delivered',
      })
      .eq('id', item.order_id)

    return NextResponse.json({
      success: true,
    })
  } catch (err) {
    console.error(err)

    return NextResponse.json(
      {
        error:
          'Something went wrong',
      },
      { status: 500 }
    )
  }
}