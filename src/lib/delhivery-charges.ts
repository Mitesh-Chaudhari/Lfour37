import {
  delhiveryChargeWeightGrams,
  quoteDtdcRate,
} from '@/lib/dtdc'

export { delhiveryChargeWeightGrams }

export type PartialCodCharges = {
  originPin: string
  destinationPin: string
  weightGrams: number
  mode: 'E' | 'S'
  forward: number
  reverse: number
  total: number
}

/** Kept at zero when rate API is unavailable; checkout still validates PIN separately. */
export const FLAT_PARTIAL_COD_DELIVERY_CHARGE = 0

/**
 * Quote DTDC forward shipping for Partial COD advance.
 * Falls back to zero when DTDC_RATE_API_TOKEN is not configured.
 */
export async function quotePartialCodCharges(
  destinationPin: string,
  itemCount = 1
): Promise<PartialCodCharges> {
  const originPin = (process.env.DELHIVERY_RETURN_PIN || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(originPin)) {
    throw new Error('DELHIVERY_RETURN_PIN is not configured')
  }
  if (!/^\d{6}$/.test(destinationPin)) {
    throw new Error('Invalid destination PIN')
  }

  const weightGrams = delhiveryChargeWeightGrams(itemCount)
  const weightKg = weightGrams / 1000
  const mode = process.env.DTDC_SHIPPING_MODE?.toUpperCase().startsWith('A')
    ? 'E'
    : 'S'

  if (!process.env.DTDC_RATE_API_TOKEN) {
    return {
      originPin,
      destinationPin,
      weightGrams,
      mode,
      forward: FLAT_PARTIAL_COD_DELIVERY_CHARGE,
      reverse: 0,
      total: FLAT_PARTIAL_COD_DELIVERY_CHARGE,
    }
  }

  const quote = await quoteDtdcRate(destinationPin, {
    weightKg,
    invoiceValue: 1000,
    codAmount: 1000,
    mode: mode === 'E' ? 'AIR' : 'SURFACE',
  })

  return {
    originPin,
    destinationPin,
    weightGrams,
    mode,
    forward: quote.total,
    reverse: 0,
    total: quote.total,
  }
}
