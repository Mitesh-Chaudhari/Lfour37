import logger from '@/lib/logger'

const DEFAULT_BASE_URL = 'https://track.delhivery.com'

export type DelhiveryChargeQuote = {
  total: number
  freight: number
  codCharge: number
  rtoCharge: number
}

export type PartialCodCharges = {
  originPin: string
  destinationPin: string
  weightGrams: number
  mode: 'E' | 'S'
  forward: number
  reverse: number
  total: number
}

function shippingMode(): 'E' | 'S' {
  const raw = (process.env.DELHIVERY_SHIPPING_MODE || 'S').toUpperCase()
  return raw.startsWith('E') ? 'E' : 'S'
}

export function delhiveryChargeWeightGrams(itemCount = 1): number {
  const perPackage = Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500)
  const grams = Number.isFinite(perPackage) && perPackage > 0 ? perPackage : 500
  return Math.max(grams, grams * Math.max(1, itemCount))
}

function roundUpRupees(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.ceil(value)
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseQuote(body: unknown): DelhiveryChargeQuote | null {
  const row = Array.isArray(body) ? body[0] : body
  if (!row || typeof row !== 'object') return null

  const record = row as Record<string, unknown>
  const total = asNumber(
    record.total_amount ?? record.total_charge ?? record.gross_amount
  )
  const freight = asNumber(record.freight_charge ?? record.freight)
  const codCharge = asNumber(record.cod_charge ?? record.cod_charges)
  const rtoCharge = asNumber(
    record.rto_charge ?? record.rto_charges ?? record.return_charge
  )

  if (total <= 0 && freight <= 0) return null

  return {
    total: total > 0 ? total : freight + codCharge + rtoCharge,
    freight,
    codCharge,
    rtoCharge,
  }
}

async function fetchKinkoQuote(params: {
  md: 'E' | 'S'
  ss: 'Delivered' | 'RTO'
  pt: 'COD' | 'Pickup' | 'Pre-paid'
  originPin: string
  destinationPin: string
  weightGrams: number
}): Promise<DelhiveryChargeQuote | null> {
  const token = process.env.DELHIVERY_API_TOKEN
  const baseUrl = (
    process.env.DELHIVERY_BASE_URL ||
    process.env.DELHIVERY_BASE_PRODUCTION_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/$/, '')

  if (!token) throw new Error('DELHIVERY_API_TOKEN is not configured')

  const query = new URLSearchParams({
    md: params.md,
    ss: params.ss,
    d_pin: params.destinationPin,
    o_pin: params.originPin,
    cgm: String(Math.round(params.weightGrams)),
    pt: params.pt,
  })

  const response = await fetch(
    `${baseUrl}/api/kinko/v1/invoice/charges/.json?${query.toString()}`,
    {
      headers: {
        Authorization: `Token ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    }
  )

  const text = await response.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    logger.warn('Delhivery kinko charge lookup failed', {
      status: response.status,
      ss: params.ss,
      pt: params.pt,
      body,
    })
    return null
  }

  return parseQuote(body)
}

/**
 * Quote Delhivery forward shipping for Partial COD advance.
 * Reverse/RTO is not charged upfront for now.
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

  const mode = shippingMode()
  const weightGrams = delhiveryChargeWeightGrams(itemCount)

  const forward =
    (await fetchKinkoQuote({
      md: mode,
      ss: 'Delivered',
      pt: 'COD',
      originPin,
      destinationPin,
      weightGrams,
    })) ||
    (await fetchKinkoQuote({
      md: mode,
      ss: 'Delivered',
      pt: 'Pre-paid',
      originPin,
      destinationPin,
      weightGrams,
    }))

  if (!forward) {
    throw new Error('Could not fetch Delhivery forward shipping charges')
  }

  const forwardAmount = roundUpRupees(forward.total)
  if (forwardAmount < 1) {
    throw new Error('Delhivery returned zero forward shipping charges')
  }

  return {
    originPin,
    destinationPin,
    weightGrams,
    mode,
    forward: forwardAmount,
    reverse: 0,
    total: forwardAmount,
  }
}
