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

    // get item
    const {
      data: item,
      error: itemError,
    } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        return_type
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

    const isExchange =
      item.return_type ===
      'exchange'

    const nextStatus =
      isExchange
        ? 'exchange_initiated'
        : 'return_initiated'

    // update order item
    const { error } =
      await supabase
        .from('order_items')
        .update({
          return_status:
            'return_approved',

          status: nextStatus,

          return_approved_at:
            new Date().toISOString(),
        })
        .eq('id', item_id)

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        { status: 500 }
      )
    }

    // update parent order
    await supabase
      .from('orders')
      .update({
        status: nextStatus,
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