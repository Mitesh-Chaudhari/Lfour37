import { NextRequest, NextResponse } from 'next/server'
import { quotePartialCodCharges } from '@/lib/delhivery-charges'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const pin = (req.nextUrl.searchParams.get('pin') || '').replace(/\D/g, '')
  const items = Number(req.nextUrl.searchParams.get('items') || '1')

  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: 'A valid 6-digit PIN code is required' },
      { status: 400 }
    )
  }

  try {
    const charges = await quotePartialCodCharges(
      pin,
      Number.isFinite(items) ? items : 1
    )
    return NextResponse.json(charges)
  } catch (error) {
    logger.warn('Partial COD delivery charge failed', { error, pin })
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not apply the Partial COD delivery charge',
      },
      { status: 502 }
    )
  }
}
