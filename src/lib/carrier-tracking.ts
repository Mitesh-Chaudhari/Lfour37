import { trackDtdcShipment } from '@/lib/dtdc'
import {
  isDelhiveryTrackingConfigured,
  trackDelhiveryShipment,
} from '@/lib/delhivery-legacy-tracking'
import {
  resolveShipmentCarrier,
  type ShipmentCarrier,
} from '@/lib/shipment-carrier'
import type { NormalizedDelhiveryTracking } from '@/lib/dtdc'

type CarrierTrackHints = {
  carrier?: string | null
  create_response?: unknown
}

function resolveCarrier(hints?: CarrierTrackHints): ShipmentCarrier {
  return resolveShipmentCarrier({
    carrier: hints?.carrier,
    create_response: hints?.create_response,
  })
}

/**
 * Route tracking to Delhivery or DTDC based on shipment carrier.
 * Legacy rows default to Delhivery; new bookings use DTDC.
 */
export async function trackShipmentByCarrier(
  awb: string,
  hints?: CarrierTrackHints
): Promise<NormalizedDelhiveryTracking> {
  const carrier = resolveCarrier(hints)

  if (carrier === 'delhivery') {
    if (!isDelhiveryTrackingConfigured()) {
      throw new Error(
        'DELHIVERY_API_TOKEN is not configured (required for legacy Delhivery AWBs)'
      )
    }
    return trackDelhiveryShipment(awb)
  }

  return trackDtdcShipment(awb)
}

/** Default export used by shipping sync — pass carrier when known. */
export async function trackShipment(
  awb: string,
  carrier?: string | null
): Promise<NormalizedDelhiveryTracking> {
  return trackShipmentByCarrier(awb, { carrier })
}
