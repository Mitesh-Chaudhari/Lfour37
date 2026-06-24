import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyReturnOrExchangeRequested } from '@/lib/whatsapp/order-notifications'
import logger from '@/lib/logger'

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

        const { data: item } = await supabase
            .from('order_items')
            .select('id, order_id, orders!inner(user_id)')
            .eq('id', order_item_id)
            .single()

        if (!item) {
            return NextResponse.json(
                { error: 'Order item not found' },
                { status: 404 }
            )
        }

        const orderOwnerId = Array.isArray(item.orders)
            ? item.orders[0]?.user_id
            : (item.orders as { user_id?: string } | null)?.user_id

        if (orderOwnerId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

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

        // SEND RETURN MESSAGE
        try {
            const { data: itemDetails } =
                await supabase
                    .from('order_items')
                    .select(`
            *,
            orders (
            order_number,
            shipping_address,
            user_id
            )
        `)
                    .eq('id', order_item_id)
                    .single()

            const orderData = (itemDetails as {
              orders?: {
                order_number?: string
                shipping_address?: { phone?: string }
                user_id?: string
              }
              product_name?: string
              variant_size?: string | null
              variant_color?: string | null
              quantity?: number
              order_id?: string
            })?.orders

            if (itemDetails && orderData) {
              await notifyReturnOrExchangeRequested({
                order: {
                  id: itemDetails.order_id,
                  order_number: orderData.order_number || '',
                  user_id: orderData.user_id || user.id,
                  shipping_address: orderData.shipping_address,
                },
                item: {
                  product_name: itemDetails.product_name,
                  variant_size: itemDetails.variant_size,
                  variant_color: itemDetails.variant_color,
                  quantity: itemDetails.quantity,
                },
                returnType: return_type === 'exchange' ? 'exchange' : 'return',
                currentStatus: 'return_requested',
              })
            }

        } catch (err) {
            logger.error(
                'Return WhatsApp Failed',
                err
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