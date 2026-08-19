export type ShipmentCarrier = 'delhivery' | 'dtdc'

type CarrierSource = {
  carrier?: string | null
  create_response?: unknown
} | null | undefined

function isDtdcCreateResponse(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false
  const body = response as { status?: string; data?: unknown[] }
  return body.status === 'OK' && Array.isArray(body.data)
}

/** Resolve courier for a shipment row (DB column, then create_response heuristics). */
export function resolveShipmentCarrier(source: CarrierSource): ShipmentCarrier {
  const explicit = source?.carrier?.toLowerCase()
  if (explicit === 'dtdc' || explicit === 'delhivery') {
    return explicit
  }

  if (isDtdcCreateResponse(source?.create_response)) {
    return 'dtdc'
  }

  return 'delhivery'
}

export function getCarrierDisplayName(carrier: ShipmentCarrier): string {
  return carrier === 'dtdc' ? 'DTDC' : 'Delhivery'
}

export function getShipmentCarrierLabel(source: CarrierSource): string {
  return getCarrierDisplayName(resolveShipmentCarrier(source))
}
