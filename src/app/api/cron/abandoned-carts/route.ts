import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  ABANDONED_CART_IDLE_MS,
  type AbandonedCartItem,
} from '@/lib/abandoned-cart'
import { notifyAbandonedCart } from '@/lib/whatsapp/abandoned-cart'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  const secret =
    process.env.ABANDONED_CART_CRON_SECRET ||
    process.env.DELHIVERY_CRON_SECRET

  const authorization = request.headers.get('authorization')
  const isManualCall = Boolean(secret) && authorization === `Bearer ${secret}`

  return isVercelCron || isManualCall
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const limit = Math.min(
      Number(request.nextUrl.searchParams.get('limit') || 50),
      100
    )

    const idleBefore = new Date(
      Date.now() - ABANDONED_CART_IDLE_MS
    ).toISOString()

    const { data: carts, error } = await supabase
      .from('abandoned_carts')
      .select('id, user_id, phone, items, cart_updated_at')
      .is('recovered_at', null)
      .is('reminder_sent_at', null)
      .lte('cart_updated_at', idleBefore)
      .not('phone', 'eq', '')
      .order('cart_updated_at', { ascending: true })
      .limit(limit)

    if (error) {
      logger.error('Abandoned cart cron query failed', { error })
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    const results: Array<{
      id: string
      user_id: string
      status: 'sent' | 'skipped' | 'failed'
      reason?: string
    }> = []

    for (const cart of carts || []) {
      const items = (cart.items || []) as AbandonedCartItem[]

      if (!items.length) {
        results.push({
          id: cart.id,
          user_id: cart.user_id,
          status: 'skipped',
          reason: 'empty_items',
        })
        continue
      }

      if (!cart.phone?.trim()) {
        results.push({
          id: cart.id,
          user_id: cart.user_id,
          status: 'skipped',
          reason: 'no_phone',
        })
        continue
      }

      // Skip if user placed an order after last cart activity
      const { data: recentOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', cart.user_id)
        .gte('created_at', cart.cart_updated_at)
        .not('status', 'eq', 'cancelled')
        .limit(1)
        .maybeSingle()

      if (recentOrder) {
        await supabase
          .from('abandoned_carts')
          .update({
            recovered_at: new Date().toISOString(),
            items: [],
          })
          .eq('id', cart.id)
          .is('recovered_at', null)

        results.push({
          id: cart.id,
          user_id: cart.user_id,
          status: 'skipped',
          reason: 'ordered_after_cart',
        })
        continue
      }

      const firstImage =
        items.find((item) => item.image_url)?.image_url || null

      const sent = await notifyAbandonedCart({
        phone: cart.phone,
        userId: cart.user_id,
        firstProductImage: firstImage,
        cartPath: 'cart',
      })

      if (!sent) {
        results.push({
          id: cart.id,
          user_id: cart.user_id,
          status: 'failed',
          reason: 'whatsapp_send_failed',
        })
        continue
      }

      const { error: updateError } = await supabase
        .from('abandoned_carts')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', cart.id)
        .is('reminder_sent_at', null)
        .is('recovered_at', null)

      if (updateError) {
        logger.warn('Failed to set reminder_sent_at', {
          error: updateError,
          cartId: cart.id,
        })
      }

      results.push({
        id: cart.id,
        user_id: cart.user_id,
        status: 'sent',
      })
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      sent: results.filter((r) => r.status === 'sent').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    })
  } catch (error) {
    logger.error('Abandoned cart cron failed', { error })
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
