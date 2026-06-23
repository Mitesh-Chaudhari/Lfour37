import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'

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
            shipping_address
            )
        `)
                    .eq('id', order_item_id)
                    .single()

            const ordersUrl =
                `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/orders`

            const message =
                `LFOUR37

    Order ID:
    ${(itemDetails as any)?.orders?.order_number}

    📦 ${return_type === 'exchange'
                    ? 'EXCHANGE REQUEST'
                    : 'RETURN REQUEST'} RECEIVED

    • ${itemDetails?.product_name}

    ${itemDetails?.variant_size || '-'} / ${itemDetails?.variant_color || '-'}

    Status:
    RETURN REQUESTED

    Our team will review your request shortly.

    Track updates:
    ${ordersUrl}

    Thank you for shopping with LFOUR37 ❤️`

            await sendWhatsAppTemplate({
                phone:
                    (itemDetails as any)?.orders
                        ?.shipping_address
                        ?.phone,

                userId:
                    user.id,

                orderId:
                    (itemDetails as any)?.order_id,

                templateName:
                    return_type === 'exchange'
                        ? 'exchange_requested'
                        : 'return_requested',

                variables: [
                    (itemDetails as any)?.orders
                        ?.order_number || '',

                    itemDetails?.product_name || '',

                    `${itemDetails?.variant_size || '-'} / ${itemDetails?.variant_color || '-'}`,

                    `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/orders`,
                ],
            })

        } catch (err) {
            console.error(
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