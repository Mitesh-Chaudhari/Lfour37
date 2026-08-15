/** Kept for compatibility with older checkout clients; COD delivery is free. */
export const FLAT_PARTIAL_COD_DELIVERY_CHARGE = 0

export type PartialCodCharges = {
  originPin: string
  destinationPin: string
  weightGrams: number
  mode: 'E' | 'S'
  forward: number
  reverse: number
  total: number
}

export function delhiveryChargeWeightGrams(itemCount = 1): number {
  const perPackage = Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500)
  const grams = Number.isFinite(perPackage) && perPackage > 0 ? perPackage : 500
  return Math.max(grams, grams * Math.max(1, itemCount))
}

/**
 * Return zero for older clients that still request a Partial COD quote.
 * PIN serviceability/COD availability is validated separately.
 */
export async function quotePartialCodCharges(
  destinationPin: string,
  itemCount = 1
): Promise<PartialCodCharges> {
  const originPin = (process.env.DELHIVERY_RETURN_PIN || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(destinationPin)) {
    throw new Error('Invalid destination PIN')
  }

  const mode = 'S' as const
  const weightGrams = delhiveryChargeWeightGrams(itemCount)

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
