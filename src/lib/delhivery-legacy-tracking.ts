import logger from '@/lib/logger'
import type { NormalizedDelhiveryTracking } from '@/lib/dtdc'

const DEFAULT_BASE_URL = 'https://track.delhivery.com'

function getTrackingConfig() {
  const token = process.env.DELHIVERY_API_TOKEN
  const baseUrl = (
    process.env.DELHIVERY_BASE_URL ||
    process.env.DELHIVERY_BASE_PRODUCTION_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/$/, '')

  if (!token) {
    throw new Error('DELHIVERY_API_TOKEN is not configured')
  }

  return { token, baseUrl }
}

async function delhiveryTrackingRequest<T>(path: string): Promise<T> {
  const { token, baseUrl } = getTrackingConfig()
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let body: unknown = text

  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Delhivery sometimes returns plain text on errors.
  }

  if (!response.ok) {
    logger.error('Delhivery tracking request failed', {
      path,
      status: response.status,
      body,
    })
    throw new Error(`Delhivery API returned HTTP ${response.status}`)
  }

  return body as T
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function normalizeDelhiveryTrackingResponse(
  response: unknown,
  fallbackAwb: string
): NormalizedDelhiveryTracking {
  const data = response as {
    ShipmentData?: Array<{
      Shipment?: {
        AWB?: string
        ExpectedDeliveryDate?: string
        Status?: {
          Status?: string
          StatusCode?: string
          StatusType?: string
          StatusDateTime?: string
          Instructions?: string
        }
        Scans?: Array<{
          ScanDetail?: {
            Scan?: string
            StatusCode?: string
            ScanType?: string
            ScannedLocation?: string
            Instructions?: string
            ScanDateTime?: string
          }
        }>
      }
    }>
  }

  const shipment = data?.ShipmentData?.[0]?.Shipment
  if (!shipment) {
    throw new Error('Delhivery tracking response has no shipment data')
  }

  const current = shipment.Status
  const currentStatus = asString(current?.Status) || 'Unknown'
  const events = (shipment.Scans || [])
    .map((entry) => entry.ScanDetail)
    .filter(Boolean)
    .map((scan) => ({
      status: asString(scan?.Scan) || 'Unknown',
      statusCode: asString(scan?.StatusCode),
      statusType: asString(scan?.ScanType),
      location: asString(scan?.ScannedLocation),
      instructions: asString(scan?.Instructions),
      occurredAt: asString(scan?.ScanDateTime),
    }))

  const deliveredEvent = [...events]
    .reverse()
    .find((event) => event.status.toLowerCase().includes('delivered'))

  return {
    awb: asString(shipment.AWB) || fallbackAwb,
    currentStatus,
    statusCode: asString(current?.StatusCode),
    statusType: asString(current?.StatusType),
    instructions: asString(current?.Instructions),
    expectedDeliveryDate: asString(shipment.ExpectedDeliveryDate),
    deliveredAt:
      deliveredEvent?.occurredAt ||
      (currentStatus.toLowerCase().includes('delivered')
        ? asString(current?.StatusDateTime)
        : null),
    events,
    raw: response,
  }
}

/** Track a legacy Delhivery AWB (in-transit orders booked before DTDC). */
export async function trackDelhiveryShipment(
  awb: string
): Promise<NormalizedDelhiveryTracking> {
  const response = await delhiveryTrackingRequest<unknown>(
    `/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`
  )

  return normalizeDelhiveryTrackingResponse(response, awb)
}

export function isDelhiveryTrackingConfigured(): boolean {
  return Boolean(process.env.DELHIVERY_API_TOKEN)
}
