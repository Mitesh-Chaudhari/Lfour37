import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()

    const {
      order_item_id,
      return_reason_id,
      return_custom_reason,
      return_type,
      refund_method,
      bank_account,
      exchange_size,
      exchange_color,
    } = body

    // VALIDATE
    if (!order_item_id) {
      return NextResponse.json(
        { error: 'Order item required' },
        { status: 400 }
      )
    }

    // HANDLE OTHER REASON
    const finalReasonId =
      return_reason_id === 'other'
        ? null
        : return_reason_id

    const finalCustomReason =
      return_reason_id === 'other'
        ? return_custom_reason
        : null

    // UPDATE ITEM
    const { error } = await supabase
      .from('order_items')
      .update({
        return_status: 'return_requested',

        return_reason_id: finalReasonId,

        return_custom_reason:
          finalCustomReason,

        return_type,

        refund_method,

        bank_account:
          refund_method === 'bank'
            ? bank_account
            : null,

        exchange_size:
          return_type === 'exchange'
            ? exchange_size
            : null,

        exchange_color:
          return_type === 'exchange'
            ? exchange_color
            : null,

        return_requested_at:
          new Date().toISOString(),
      })
      .eq('id', order_item_id)

    if (error) {
      console.error(error)

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
    })
  } catch (err: any) {
    console.error(err)

    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}