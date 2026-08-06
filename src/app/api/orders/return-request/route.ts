import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyReturnOrExchangeRequested } from '@/lib/whatsapp/order-notifications'
import { sendReturnOrExchangeRequestedOwnerNotificationEmail } from '@/lib/email'
import logger from '@/lib/logger'
import { isWithinReturnWindow } from '@/lib/returns'
import {
    findVariantByDims,
    isSameVariantDims,
    productHasColorOptions,
    productHasSizeOptions,
} from '@/lib/product-variants'

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
            seal_tag_image_url,
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

        const sealTagUrl =
            typeof seal_tag_image_url === 'string'
                ? seal_tag_image_url.trim()
                : ''

        if (!sealTagUrl || !/^https?:\/\//i.test(sealTagUrl)) {
            return NextResponse.json(
                {
                    error:
                        'Upload a clear photo of the product with the seal tag intact',
                },
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
                    payment_method,
                    delivered_at
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
                delivered_at?: string | null
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

        if (!isWithinReturnWindow(orderData?.delivered_at)) {
            return NextResponse.json(
                { error: 'Return or exchange window has expired (7 days after delivery)' },
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
            const { data: productVariants, error: variantsError } = await supabase
                .from('product_variants')
                .select('id, size, color, stock')
                .eq('product_id', item.product_id)
                .eq('is_active', true)

            if (variantsError) {
                return NextResponse.json(
                    { error: 'Unable to validate exchange options' },
                    { status: 500 }
                )
            }

            const activeVariants = productVariants || []
            const requireSize = productHasSizeOptions(activeVariants)
            const requireColor = productHasColorOptions(activeVariants)
            const dimOptions = { requireSize, requireColor }

            if (requireSize && !exchange_size) {
                return NextResponse.json(
                    { error: 'Select an exchange size' },
                    { status: 400 }
                )
            }

            if (requireColor && !exchange_color) {
                return NextResponse.json(
                    { error: 'Select an exchange color' },
                    { status: 400 }
                )
            }

            if (
                isSameVariantDims(
                    { size: exchange_size, color: exchange_color },
                    { size: item.variant_size, color: item.variant_color },
                    dimOptions
                )
            ) {
                return NextResponse.json(
                    { error: 'Select a different size or color for exchange' },
                    { status: 400 }
                )
            }

            const inStockVariants = activeVariants.filter(
                (variant) => Number(variant.stock || 0) > 0
            )

            const exchangeVariant = findVariantByDims(
                inStockVariants,
                { size: exchange_size, color: exchange_color },
                dimOptions
            )

            if (!exchangeVariant) {
                return NextResponse.json(
                    { error: 'Selected exchange variant is unavailable' },
                    { status: 400 }
                )
            }

            finalExchangeSize = exchangeVariant.size || exchange_size || null
            finalExchangeColor = exchangeVariant.color || exchange_color || null
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

                finalBankAccount = {
                    account_holder_name:
                        bank_account.account_holder_name?.trim() || null,
                    bank_name: String(bank_account.bank_name).trim(),
                    account_number: String(bank_account.account_number).trim(),
                    ifsc: String(bank_account.ifsc).trim().toUpperCase(),
                    user_bank_account_id:
                        bank_account.user_bank_account_id || null,
                }
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

                seal_tag_image_url: sealTagUrl,

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

        // SEND RETURN MESSAGE + OWNER EMAIL
        try {
            const { data: itemDetails } =
                await supabase
                    .from('order_items')
                    .select(`
            *,
            orders (
            id,
            order_number,
            total,
            payment_method,
            payment_status,
            shipping_address,
            user_id
            )
        `)
                    .eq('id', order_item_id)
                    .single()

            const orderData = (itemDetails as {
              orders?: {
                id?: string
                order_number?: string
                total?: number
                payment_method?: string
                payment_status?: string
                shipping_address?: { phone?: string; full_name?: string }
                user_id?: string
              }
              product_name?: string
              variant_size?: string | null
              variant_color?: string | null
              quantity?: number
              order_id?: string
              exchange_size?: string | null
              exchange_color?: string | null
              refund_method?: string | null
              return_reason_id?: string | null
              return_custom_reason?: string | null
              seal_tag_image_url?: string | null
              bank_account?: {
                account_holder_name?: string | null
                bank_name?: string | null
                account_number?: string | null
                ifsc?: string | null
              } | null
            })?.orders

            if (itemDetails && orderData) {
              let reasonLabel: string | null =
                itemDetails.return_custom_reason || null
              if (!reasonLabel && itemDetails.return_reason_id) {
                const { data: reasonRow } = await supabase
                  .from('return_reasons')
                  .select('label')
                  .eq('id', itemDetails.return_reason_id)
                  .maybeSingle()
                reasonLabel = reasonRow?.label || null
              }

              const { data: orderUser } = orderData.user_id
                ? await supabase
                    .from('users')
                    .select('email')
                    .eq('id', orderData.user_id)
                    .maybeSingle()
                : { data: null }

              sendReturnOrExchangeRequestedOwnerNotificationEmail(
                {
                  id: orderData.id || itemDetails.order_id || '',
                  order_number: orderData.order_number || '',
                  total: Number(orderData.total || 0),
                  payment_method: orderData.payment_method || null,
                  payment_status: orderData.payment_status || null,
                  shipping_address: orderData.shipping_address || null,
                },
                {
                  customerEmail: orderUser?.email || user.email || null,
                  requestType:
                    return_type === 'exchange' ? 'exchange' : 'return',
                  item: {
                    product_name: itemDetails.product_name,
                    variant_size: itemDetails.variant_size,
                    variant_color: itemDetails.variant_color,
                    quantity: itemDetails.quantity,
                    exchange_size: itemDetails.exchange_size,
                    exchange_color: itemDetails.exchange_color,
                    refund_method: itemDetails.refund_method,
                    seal_tag_image_url: itemDetails.seal_tag_image_url,
                    bank_account: itemDetails.bank_account,
                  },
                  reason: reasonLabel,
                }
              ).catch((err) =>
                logger.error('Owner return/exchange notification failed', {
                  err,
                  orderItemId: order_item_id,
                })
              )

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
                'Return notification failed',
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