/**
 * POST /api/payments/cod-to-prepaid/decline
 *
 * Called when the customer taps "KEEP CASH ON DELIVERY".
 * No auth — validated by signed token.
 * Marks the offer as declined and stops all further reminders.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCodPrepaidToken } from '@/lib/cod-prepaid-token'
import logger from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  token: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const tokenPayload = verifyCodPrepaidToken(parsed.data.token)
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Link is invalid or has expired' },
        { status: 400 }
      )
    }

    const { orderId } = tokenPayload
    const admin = createAdminClient()

    const { error } = await admin
      .from('cod_prepaid_offers')
      .update({ offer_status: 'declined', declined_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('offer_status', 'pending')

    if (error) {
      logger.error('Failed to decline COD prepaid offer', { error, orderId })
      return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 })
    }

    logger.info('COD prepaid offer declined by customer', { orderId })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('COD prepaid decline failed', { error })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
