import logger from '@/lib/logger'

const DEFAULT_BASE_URL = 'https://track.delhivery.com'

export type DelhiveryOrder = {
  id: string
  order_number: string
  total: number
  payment_status: string
  payment_method?: string
  shipping_address: {
    full_name: string
    phone: string
    address_line1: string
    address_line2?: string | null
    city: string
    state: string
    postal_code: string
    country?: string
  }
}

export type DelhiveryOrderItem = {
  product_name: string
  quantity: number
  variant_size?: string | null
  variant_color?: string | null
}

export type DelhiveryTrackingEvent = {
  status: string
  statusCode: string | null
  statusType: string | null
  location: string | null
  instructions: string | null
  occurredAt: string | null
}

export type NormalizedDelhiveryTracking = {
  awb: string
  currentStatus: string
  statusCode: string | null
  statusType: string | null
  instructions: string | null
  expectedDeliveryDate: string | null
  deliveredAt: string | null
  events: DelhiveryTrackingEvent[]
  raw: unknown
}

function getConfig() {
  const token = process.env.DELHIVERY_API_TOKEN
  const pickupName = process.env.DELHIVERY_PICKUP_NAME
  const baseUrl =
    process.env.DELHIVERY_BASE_URL ||
    process.env.DELHIVERY_BASE_PRODUCTION_URL ||
    DEFAULT_BASE_URL

  if (!token) throw new Error('DELHIVERY_API_TOKEN is not configured')
  if (!pickupName) throw new Error('DELHIVERY_PICKUP_NAME is not configured')

  return {
    token,
    pickupName,
    baseUrl: baseUrl.replace(/\/$/, ''),
  }
}

async function delhiveryRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { token, baseUrl } = getConfig()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      Accept: 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let body: unknown = text

  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Some Delhivery errors are returned as plain text.
  }

  if (!response.ok) {
    logger.error('Delhivery API request failed', {
      path,
      status: response.status,
      body,
    })
    throw new Error(`Delhivery API returned HTTP ${response.status}`)
  }

  return body as T
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function shipmentDescription(items: DelhiveryOrderItem[]): string {
  return items
    .map((item) => {
      const variant = [item.variant_size, item.variant_color]
        .filter(Boolean)
        .join('/')
      return `${item.product_name}${variant ? ` (${variant})` : ''} x${item.quantity}`
    })
    .join(', ')
    .slice(0, 990)
}

function totalQuantity(items: DelhiveryOrderItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export async function createShipment({
  order,
  items,
}: {
  order: DelhiveryOrder
  items: DelhiveryOrderItem[]
}): Promise<unknown> {
  const { pickupName } = getConfig()
  const address = order.shipping_address
  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  const shipmentData = {
    shipments: [
      {
        name: address.full_name,
        add: addressText,
        pin: address.postal_code,
        city: address.city,
        state: address.state,
        country: address.country || 'India',
        phone: address.phone,
        order: order.order_number,
        payment_mode: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
        order_date: today(),
        total_amount: String(order.total),
        cod_amount:
          order.payment_method === 'cod' ? String(order.total) : '0',
        quantity: String(totalQuantity(items)),
        products_desc: shipmentDescription(items),
        weight: (
          Number(
            process.env
              .DELHIVERY_DEFAULT_WEIGHT_GRAMS ||
              500
          ) / 1000
        ).toFixed(2),        shipment_length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
        shipment_width: process.env.DELHIVERY_DEFAULT_WIDTH_CM || '20',
        shipment_height: process.env.DELHIVERY_DEFAULT_HEIGHT_CM || '5',
        seller_name: requiredEnv('DELHIVERY_SELLER_NAME'),
        seller_add: requiredEnv('DELHIVERY_SELLER_ADDRESS'),
        seller_inv: order.order_number,
        seller_gst_tin: process.env.DELHIVERY_SELLER_GSTIN || '',
        return_name:
          process.env.DELHIVERY_RETURN_NAME ||
          requiredEnv('DELHIVERY_SELLER_NAME'),
        return_add:
          process.env.DELHIVERY_RETURN_ADDRESS ||
          requiredEnv('DELHIVERY_SELLER_ADDRESS'),
        return_city: requiredEnv('DELHIVERY_RETURN_CITY'),
        return_state: requiredEnv('DELHIVERY_RETURN_STATE'),
        return_country: 'India',
        return_phone: requiredEnv('DELHIVERY_RETURN_PHONE'),
        return_pin: requiredEnv('DELHIVERY_RETURN_PIN'),
        invoice_number: order.order_number,
        invoice_date: today(),
      },
    ],
    pickup_location: {
      name: pickupName,
    },
  }

  const body = new URLSearchParams({
    format: 'json',
    data: JSON.stringify(shipmentData),
  })

  return delhiveryRequest('/api/cmu/create.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
}

type DelhiveryCreateResponse = {
  success?: boolean
  packages?: Array<{
    waybill?: string
    status?: string
    remarks?: string[]
    refnum?: string
  }>
  rmk?: string
  remark?: string
  error?: string
}

export function formatDelhiveryError(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('insufficient balance')) {
    return (
      'Delhivery wallet has insufficient balance for prepaid shipments. ' +
      'Recharge your Delhivery One account wallet, then retry Create Shipment.'
    )
  }

  if (normalized.includes('pickup location') || normalized.includes('pickup name')) {
    return (
      `${message} Check that DELHIVERY_PICKUP_NAME exactly matches your Delhivery pickup location.`
    )
  }

  return message
}

export function parseShipmentCreationResponse(response: unknown): {
  awb: string
  status: string
} {
  const data = response as DelhiveryCreateResponse
  const shipment = data?.packages?.[0]
  const awb = shipment?.waybill?.trim()

  if (data?.success === false || !awb) {
    const details =
      shipment?.remarks?.join(', ') ||
      data?.rmk ||
      data?.remark ||
      data?.error ||
      'Delhivery did not return an AWB'
    throw new Error(formatDelhiveryError(`Shipment creation failed: ${details}`))
  }

  return {
    awb,
    status: shipment?.status || 'Manifested',
  }
}

export async function trackShipment(
  awb: string
): Promise<NormalizedDelhiveryTracking> {
  const response = await delhiveryRequest<unknown>(
    `/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`
  )

  return normalizeTrackingResponse(response, awb)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function normalizeTrackingResponse(
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
  if (!shipment) throw new Error('Delhivery tracking response has no shipment data')

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

export function mapDelhiveryStatusToOrderStatus(
  status: string
): 'processing' | 'shipped' | 'delivered' | 'cancelled' | null {
  const normalized = status.toLowerCase()

  if (
    normalized.includes('rto delivered') ||
    normalized.includes('returned to origin') ||
    normalized.includes('return to origin')
  ) {
    return 'cancelled'
  }

  if (normalized.includes('delivered') && !normalized.includes('undelivered')) {
    return 'delivered'
  }

  if (
    normalized.includes('in transit') ||
    normalized.includes('dispatched') ||
    normalized.includes('out for delivery') ||
    normalized.includes('picked') ||
    normalized.includes('pickup')
  ) {
    return 'shipped'
  }

  if (
    normalized.includes('manifest') ||
    normalized.includes('pending') ||
    normalized.includes('scheduled')
  ) {
    return 'processing'
  }

  return null
}

export function getTrackingMilestone(status: string): string {
  const normalized = status.toLowerCase()

  if (normalized.includes('rto') || normalized.includes('return to origin')) {
    return 'return_to_origin'
  }
  if (normalized.includes('out for delivery')) return 'out_for_delivery'
  if (normalized.includes('delivered') && !normalized.includes('undelivered')) {
    return 'delivered'
  }
  if (normalized.includes('picked') || normalized.includes('pickup')) {
    return 'picked_up'
  }
  if (
    normalized.includes('in transit') ||
    normalized.includes('dispatched')
  ) {
    return 'in_transit'
  }
  if (
    normalized.includes('undelivered') ||
    normalized.includes('failed') ||
    normalized.includes('exception')
  ) {
    return 'delivery_exception'
  }
  if (normalized.includes('manifest') || normalized.includes('scheduled')) {
    return 'shipment_created'
  }

  return 'shipment_update'
}

export function isDelhiveryStatusCancellable(status: string): boolean {
  const normalized = status.toLowerCase()

  if (normalized.includes('out for delivery')) return false
  if (normalized.includes('delivered') && !normalized.includes('undelivered')) {
    return false
  }
  if (
    normalized.includes('rto') ||
    normalized.includes('return to origin') ||
    normalized.includes('cancel')
  ) {
    return false
  }

  const cancellableMarkers = [
    'manifest',
    'pending',
    'open',
    'scheduled',
    'in transit',
    'dispatch',
    'pickup',
    'ready to ship',
    'ready for pickup',
  ]

  return cancellableMarkers.some((marker) => normalized.includes(marker))
}

export function isDelhiveryOutForDelivery(status: string): boolean {
  return status.toLowerCase().includes('out for delivery')
}

export function mapDelhiveryReverseStatus(
  status: string
): 'picked_up' | 'in_transit' | 'delivered_to_origin' | 'cancelled' | null {
  const normalized = status.toLowerCase()

  if (normalized.includes('dto') || normalized.includes('delivered to origin')) {
    return 'delivered_to_origin'
  }
  if (normalized.includes('cancel') || normalized.includes('closed')) {
    return 'cancelled'
  }
  if (
    normalized.includes('in transit') ||
    normalized.includes('dispatched') ||
    normalized.includes('pending')
  ) {
    return 'in_transit'
  }
  if (
    normalized.includes('picked') ||
    normalized.includes('pickup') ||
    normalized.includes('scheduled') ||
    normalized.includes('open')
  ) {
    return 'picked_up'
  }

  return null
}

export type ReversePickupMilestone = 'reverse_picked_up' | 'reverse_dto'

export function getReversePickupMilestone(
  status: string,
  statusType?: string | null
): ReversePickupMilestone | null {
  const normalized = status.toLowerCase()
  const type = (statusType || '').toUpperCase()

  if (normalized.includes('dto') || normalized.includes('delivered to origin')) {
    return 'reverse_dto'
  }

  if (normalized.includes('cancel') || normalized.includes('closed')) {
    return null
  }

  // Item physically collected from the customer (Delhivery PU scan type).
  if (type === 'PU' || normalized.includes('picked up')) {
    return 'reverse_picked_up'
  }

  return null
}

export type DelhiveryReversePickupItem = {
  product_name: string
  quantity: number
  variant_size?: string | null
  variant_color?: string | null
  product_image?: string | null
  return_reason?: string | null
}

export async function cancelShipment(awb: string): Promise<unknown> {
  return delhiveryRequest('/api/p/edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      waybill: awb,
      cancellation: 'true',
    }),
  })
}

function buildReverseQcPayload(item: DelhiveryReversePickupItem) {
  const variant = [item.variant_size, item.variant_color]
    .filter(Boolean)
    .join(', ')

  return {
    item: item.product_name,
    description: variant || item.product_name,
    images: item.product_image || '',
    brand: process.env.DELHIVERY_SELLER_NAME || 'LFour37',
    product_category: 'Apparel',
    quantity: String(item.quantity),
    return_reason: item.return_reason || 'Customer return',
  }
}

export async function createReversePickup({
  order,
  item,
  reference,
}: {
  order: DelhiveryOrder
  item: DelhiveryReversePickupItem
  reference: string
}): Promise<unknown> {
  const { pickupName } = getConfig()
  const address = order.shipping_address
  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  const qcEnabled = process.env.DELHIVERY_RETURN_QC_ENABLED !== 'false'

  const shipment: Record<string, unknown> = {
    name: address.full_name,
    add: addressText,
    pin: address.postal_code,
    city: address.city,
    state: address.state,
    country: address.country || 'India',
    phone: address.phone,
    order: reference,
    payment_mode: 'Pickup',
    order_date: today(),
    total_amount: String(order.total),
    quantity: String(item.quantity),
    products_desc: shipmentDescription([item]),
    weight: (
      Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500) / 1000
    ).toFixed(2),
    shipment_length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
    shipment_width: process.env.DELHIVERY_DEFAULT_WIDTH_CM || '20',
    shipment_height: process.env.DELHIVERY_DEFAULT_HEIGHT_CM || '5',
    seller_name: requiredEnv('DELHIVERY_SELLER_NAME'),
    seller_add: requiredEnv('DELHIVERY_SELLER_ADDRESS'),
    seller_inv: reference,
    return_name:
      process.env.DELHIVERY_RETURN_NAME || requiredEnv('DELHIVERY_SELLER_NAME'),
    return_add:
      process.env.DELHIVERY_RETURN_ADDRESS ||
      requiredEnv('DELHIVERY_SELLER_ADDRESS'),
    return_city: requiredEnv('DELHIVERY_RETURN_CITY'),
    return_state: requiredEnv('DELHIVERY_RETURN_STATE'),
    return_country: 'India',
    return_phone: requiredEnv('DELHIVERY_RETURN_PHONE'),
    return_pin: requiredEnv('DELHIVERY_RETURN_PIN'),
  }

  if (qcEnabled) {
    shipment.qc = [buildReverseQcPayload(item)]
  }

  const shipmentData = {
    shipments: [shipment],
    pickup_location: {
      name: pickupName,
    },
  }

  const body = new URLSearchParams({
    format: 'json',
    data: JSON.stringify(shipmentData),
  })

  return delhiveryRequest('/api/cmu/create.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
}

export async function createExchangeForwardShipment({
  order,
  item,
  reference,
}: {
  order: DelhiveryOrder
  item: DelhiveryOrderItem
  reference: string
}): Promise<unknown> {
  const { pickupName } = getConfig()
  const address = order.shipping_address
  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  const shipmentData = {
    shipments: [
      {
        name: address.full_name,
        add: addressText,
        pin: address.postal_code,
        city: address.city,
        state: address.state,
        country: address.country || 'India',
        phone: address.phone,
        order: reference,
        payment_mode: 'Prepaid',
        order_date: today(),
        total_amount: '0',
        cod_amount: '0',
        quantity: String(item.quantity),
        products_desc: shipmentDescription([item]),
        weight: (
          Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500) / 1000
        ).toFixed(2),
        shipment_length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
        shipment_width: process.env.DELHIVERY_DEFAULT_WIDTH_CM || '20',
        shipment_height: process.env.DELHIVERY_DEFAULT_HEIGHT_CM || '5',
        seller_name: requiredEnv('DELHIVERY_SELLER_NAME'),
        seller_add: requiredEnv('DELHIVERY_SELLER_ADDRESS'),
        seller_inv: reference,
        seller_gst_tin: process.env.DELHIVERY_SELLER_GSTIN || '',
        return_name:
          process.env.DELHIVERY_RETURN_NAME ||
          requiredEnv('DELHIVERY_SELLER_NAME'),
        return_add:
          process.env.DELHIVERY_RETURN_ADDRESS ||
          requiredEnv('DELHIVERY_SELLER_ADDRESS'),
        return_city: requiredEnv('DELHIVERY_RETURN_CITY'),
        return_state: requiredEnv('DELHIVERY_RETURN_STATE'),
        return_country: 'India',
        return_phone: requiredEnv('DELHIVERY_RETURN_PHONE'),
        return_pin: requiredEnv('DELHIVERY_RETURN_PIN'),
        invoice_number: reference,
        invoice_date: today(),
      },
    ],
    pickup_location: {
      name: pickupName,
    },
  }

  const body = new URLSearchParams({
    format: 'json',
    data: JSON.stringify(shipmentData),
  })

  return delhiveryRequest('/api/cmu/create.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
}
