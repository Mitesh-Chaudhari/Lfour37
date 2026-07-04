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

        if (!['return', 'exchange'].includes(return_type)) {
            return NextResponse.json(
                { error: 'Invalid request type' },
                { status: 400 }
            )
        }

        // HANDLE OTHER REASON
        const finalReasonId =
            return_reason_id === 'other'
                ? null
                : return_reason_id || null

        const finalCustomReason =
            return_reason_id === 'other' || !return_reason_id
                ? return_custom_reason?.trim() || null
                : null

        if (!finalReasonId && !finalCustomReason) {
            return NextResponse.json(
                { error: 'Reason required' },
                { status: 400 }
            )
        }

        const { data: item } = await supabase
            .from('order_items')
            .select(`
                id,
                order_id,
                product_id,
                variant_size,
                variant_color,
                status,
                return_status,
                orders!inner(
                    user_id,
                    status,
                    payment_method
                )
            `)
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
        const orderData = Array.isArray(item.orders)
            ? item.orders[0]
            : (item.orders as {
                user_id?: string
                status?: string
                payment_method?: string
              } | null)

        if (orderOwnerId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        if (orderData?.status !== 'delivered') {
            return NextResponse.json(
                { error: 'Return or exchange is available only after delivery' },
                { status: 400 }
            )
        }

        if (item.status === 'cancelled' || item.return_status) {
            return NextResponse.json(
                { error: 'This item is not eligible for a new return or exchange request' },
                { status: 400 }
            )
        }

        const isExchange = return_type === 'exchange'
        const isCodOrder = orderData?.payment_method === 'cod'
        let finalRefundMethod: string | null = null
        let finalBankAccount = null
        let finalExchangeSize = null
        let finalExchangeColor = null

        if (isExchange) {
            if (!exchange_size || !exchange_color) {
                return NextResponse.json(
                    { error: 'Select exchange size and color' },
                    { status: 400 }
                )
            }

            if (
                exchange_size === item.variant_size &&
                exchange_color === item.variant_color
            ) {
                return NextResponse.json(
                    { error: 'Select a different size or color for exchange' },
                    { status: 400 }
                )
            }

            const { data: exchangeVariant } = await supabase
                .from('product_variants')
                .select('id')
                .eq('product_id', item.product_id)
                .eq('size', exchange_size)
                .eq('color', exchange_color)
                .eq('is_active', true)
                .gt('stock', 0)
                .maybeSingle()

            if (!exchangeVariant) {
                return NextResponse.json(
                    { error: 'Selected exchange variant is unavailable' },
                    { status: 400 }
                )
            }

            finalExchangeSize = exchange_size
            finalExchangeColor = exchange_color
        } else if (isCodOrder) {
            if (!['bank', 'store_credit'].includes(refund_method)) {
                return NextResponse.json(
                    { error: 'Select refund payment method for COD return' },
                    { status: 400 }
                )
            }

            if (refund_method === 'bank') {
                if (
                    !bank_account?.bank_name ||
                    !bank_account?.account_number ||
                    !bank_account?.ifsc
                ) {
                    return NextResponse.json(
                        { error: 'Bank details required for COD refund' },
                        { status: 400 }
                    )
                }

                finalBankAccount = bank_account
            }

            finalRefundMethod = refund_method
        } else {
            finalRefundMethod = 'source'
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

                refund_method:
                    finalRefundMethod,

                bank_account:
                    finalBankAccount,

                exchange_size:
                    finalExchangeSize,

                exchange_color:
                    finalExchangeColor,

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