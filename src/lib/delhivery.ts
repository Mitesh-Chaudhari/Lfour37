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

/** Keep only digits — Delhivery rejects spaced / formatted PIN codes. */
export function normalizeIndianPin(pin: string | null | undefined): string {
  return String(pin || '').replace(/\D/g, '').slice(0, 6)
}

/** Delhivery expects a 10-digit mobile number. */
export function normalizeIndianPhone(phone: string | null | undefined): string {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

function assertShipAddress(address: DelhiveryOrder['shipping_address']) {
  const pin = normalizeIndianPin(address.postal_code)
  const phone = normalizeIndianPhone(address.phone)

  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      `Invalid PIN code "${address.postal_code || ''}". Delhivery needs a 6-digit Indian PIN.`
    )
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new Error(
      `Invalid phone "${address.phone || ''}". Delhivery needs a 10-digit mobile number.`
    )
  }

  return { pin, phone }
}

const STATE_CODE_NAMES: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CG: 'Chhattisgarh',
  CH: 'Chandigarh',
  DD: 'Dadra and Nagar Haveli and Daman and Diu',
  DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HP: 'Himachal Pradesh',
  HR: 'Haryana',
  JH: 'Jharkhand',
  JK: 'Jammu and Kashmir',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MH: 'Maharashtra',
  ML: 'Meghalaya',
  MN: 'Manipur',
  MP: 'Madhya Pradesh',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  OR: 'Odisha',
  PB: 'Punjab',
  PY: 'Puducherry',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TG: 'Telangana',
  TS: 'Telangana',
  TN: 'Tamil Nadu',
  TR: 'Tripura',
  UA: 'Uttarakhand',
  UK: 'Uttarakhand',
  UP: 'Uttar Pradesh',
  WB: 'West Bengal',
}

function cleanLocationName(value: string): string {
  // India Post sometimes returns "Raigarh(MH)" — Delhivery wants plain names
  return value.replace(/\([A-Z]{2}\)\s*$/i, '').trim()
}

/**
 * Look up Delhivery's own city/state for a PIN before create.json.
 * Using India Post / autofill city names (e.g. Poladpur) can cause create
 * failures even when the PIN is serviceable.
 *
 * Embargo remarks are treated as temporarily unserviceable — Delhivery One
 * also blocks these ("try again after 24 hrs").
 */
export async function resolveDelhiveryPinLocation(
  pin: string,
  options: { requireCod?: boolean } = {}
): Promise<{
  pin: string
  city: string
  state: string
  stateCode: string
  codAvailable: boolean
  remarks: string | null
}> {
  const normalizedPin = normalizeIndianPin(pin)
  if (!/^\d{6}$/.test(normalizedPin)) {
    throw new Error(`Invalid PIN code "${pin}"`)
  }

  const body = await delhiveryRequest<{
    delivery_codes?: Array<{
      postal_code?: {
        pin?: number | string
        city?: string
        district?: string
        state_code?: string
        cod?: string
        pre_paid?: string
        remarks?: string
      }
    }>
  }>(`/c/api/pin-codes/json/?filter_codes=${normalizedPin}`)

  const postal = body?.delivery_codes?.[0]?.postal_code
  if (!postal) {
    throw new Error(
      `PIN ${normalizedPin} is not serviceable on Delhivery for this account`
    )
  }

  const remarks = String(postal.remarks || '').trim() || null
  if (isDelhiveryPinEmbargoed(remarks)) {
    throw new Error(
      `PIN ${normalizedPin} is temporarily under Delhivery Embargo. ` +
        `Please try again after 24 hours, or ask the customer for a different address.`
    )
  }

  const codAvailable = String(postal.cod || '').toUpperCase() === 'Y'
  const prepaidAvailable = String(postal.pre_paid || '').toUpperCase() === 'Y'

  if (!prepaidAvailable && !codAvailable) {
    throw new Error(`PIN ${normalizedPin} is not serviceable on Delhivery`)
  }

  if (options.requireCod && !codAvailable) {
    throw new Error(
      `PIN ${normalizedPin} does not support Cash on Delivery on Delhivery. Ask the customer to pay online, or ship as Prepaid.`
    )
  }

  const rawCity = String(postal.city || postal.district || '').trim()
  const stateCode = postal.state_code?.toUpperCase() || ''
  const city = rawCity ? cleanLocationName(rawCity) : ''
  const state = stateCode ? STATE_CODE_NAMES[stateCode] || stateCode : ''

  if (!city || !state) {
    throw new Error(
      `Delhivery returned incomplete location data for PIN ${normalizedPin}`
    )
  }

  return {
    pin: normalizedPin,
    city,
    state,
    stateCode,
    codAvailable,
    remarks,
  }
}

function isDelhiveryPinEmbargoed(remarks: string | null | undefined): boolean {
  if (!remarks) return false
  const normalized = remarks.toLowerCase()
  return (
    normalized.includes('embargo') ||
    normalized.includes('non serviceable') ||
    normalized.includes('non-serviceable') ||
    normalized === 'nsz'
  )
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
  const { pin, phone } = assertShipAddress(address)
  const isCod = order.payment_method === 'cod'

  // Use Delhivery pin-master city/state (not India Post autofill names)
  const location = await resolveDelhiveryPinLocation(pin, {
    requireCod: isCod,
  })

  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  const shippingMode = process.env.DELHIVERY_SHIPPING_MODE?.trim()

  const shipment: Record<string, unknown> = {
    name: address.full_name,
    add: addressText,
    // Keep pin as string — this is what worked for existing deliverable orders
    pin: location.pin,
    city: location.city,
    state: location.state,
    country: 'India',
    phone,
    order: order.order_number,
    payment_mode: isCod ? 'COD' : 'Prepaid',
    order_date: today(),
    total_amount: String(order.total),
    cod_amount: isCod ? String(order.total) : '0',
    quantity: String(totalQuantity(items)),
    products_desc: shipmentDescription(items),
    weight: (
      Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500) / 1000
    ).toFixed(2),
    shipment_length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
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
    return_phone: normalizeIndianPhone(requiredEnv('DELHIVERY_RETURN_PHONE')),
    return_pin: normalizeIndianPin(requiredEnv('DELHIVERY_RETURN_PIN')),
    invoice_number: order.order_number,
    invoice_date: today(),
  }

  if (shippingMode) {
    shipment.shipping_mode = shippingMode
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

  if (
    normalized.includes('embargo') ||
    normalized.includes('not serviceable') ||
    normalized.includes('non serviceable') ||
    normalized.includes('pincode')
  ) {
    return (
      `${message} ` +
      'If this PIN is under Delhivery Embargo, try again after 24 hours.'
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

function normalizeCarrierStatus(status: string): string {
  return status.toLowerCase().trim()
}

/** Waiting for courier — not yet collected / not in transit */
export function isDelhiveryPrePickupStatus(status: string): boolean {
  const normalized = normalizeCarrierStatus(status)

  return (
    normalized.includes('not picked') ||
    normalized.includes('pending pickup') ||
    normalized.includes('awaiting pickup') ||
    normalized.includes('ready for pickup') ||
    normalized.includes('ready to ship') ||
    normalized.includes('pickup scheduled') ||
    normalized.includes('scheduled for pickup') ||
    normalized.includes('manifest') ||
    normalized.includes('soft data') ||
    normalized === 'open' ||
    normalized.startsWith('open ') ||
    normalized.includes('pending') ||
    normalized.includes('creating') ||
    normalized.includes('scheduled')
  )
}

/** Courier has actually collected the package */
export function isDelhiveryPickedUpStatus(status: string): boolean {
  const normalized = normalizeCarrierStatus(status)
  if (isDelhiveryPrePickupStatus(normalized)) return false

  return (
    normalized.includes('picked up') ||
    normalized === 'picked' ||
    (normalized.includes('picked') && !normalized.includes('pickup'))
  )
}

/** Delhivery's official OFD status is "Dispatched" (StatusType UD), not "Out for Delivery". */
export function isDelhiveryOutForDelivery(
  status: string,
  statusType?: string | null,
  instructions?: string | null
): boolean {
  const normalized = normalizeCarrierStatus(status)
  const type = (statusType || '').toUpperCase()
  const notes = (instructions || '').toLowerCase()

  if (normalized.includes('out for delivery') || notes.includes('out for delivery')) {
    return true
  }

  // Forward flow: UD + Dispatched = out for delivery to customer
  // (RT + Dispatched is return-to-origin dispatch — not OFD)
  if (normalized === 'dispatched' || normalized.includes('dispatched')) {
    if (type === 'RT' || type === 'PP' || type === 'PU') return false
    return true
  }

  return false
}

export function mapDelhiveryStatusToOrderStatus(
  status: string,
  statusType?: string | null,
  instructions?: string | null
): 'processing' | 'shipped' | 'delivered' | 'cancelled' | null {
  const normalized = normalizeCarrierStatus(status)

  // Cancel / RTO from Delhivery portal or network — check before "delivered"
  if (
    normalized.includes('cancel') ||
    normalized.includes('rto delivered') ||
    normalized.includes('rto') ||
    normalized.includes('returned to origin') ||
    normalized.includes('return to origin')
  ) {
    return 'cancelled'
  }

  if (normalized.includes('delivered') && !normalized.includes('undelivered')) {
    return 'delivered'
  }

  // Still waiting at warehouse / for pickup — keep as processing (not "shipped")
  if (isDelhiveryPrePickupStatus(normalized)) {
    return 'processing'
  }

  if (
    normalized.includes('in transit') ||
    isDelhiveryOutForDelivery(status, statusType, instructions) ||
    isDelhiveryPickedUpStatus(normalized)
  ) {
    return 'shipped'
  }

  return null
}

export function getTrackingMilestone(
  status: string,
  statusType?: string | null,
  instructions?: string | null
): string {
  const normalized = normalizeCarrierStatus(status)

  if (
    normalized.includes('cancel') ||
    normalized.includes('rto') ||
    normalized.includes('return to origin')
  ) {
    return 'cancelled'
  }

  // Must check OFD before generic "dispatched" / in-transit handling
  if (isDelhiveryOutForDelivery(status, statusType, instructions)) {
    return 'out_for_delivery'
  }

  if (normalized.includes('delivered') && !normalized.includes('undelivered')) {
    return 'delivered'
  }
  if (
    normalized.includes('undelivered') ||
    normalized.includes('failed') ||
    normalized.includes('exception')
  ) {
    return 'delivery_exception'
  }
  // Pre-pickup / AWB created — do NOT treat as picked_up
  if (isDelhiveryPrePickupStatus(normalized)) {
    return 'shipment_created'
  }
  if (isDelhiveryPickedUpStatus(normalized)) {
    return 'picked_up'
  }
  if (normalized.includes('in transit')) {
    return 'in_transit'
  }

  return 'shipment_update'
}

export function isDelhiveryStatusCancellable(
  status: string,
  statusType?: string | null,
  instructions?: string | null
): boolean {
  const normalized = status.toLowerCase()

  if (isDelhiveryOutForDelivery(status, statusType, instructions)) return false
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
    'pickup',
    'ready to ship',
    'ready for pickup',
  ]

  return cancellableMarkers.some((marker) => normalized.includes(marker))
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

/**
 * Used for both return and exchange reverse pickups.
 * Delhivery expects `qc` as a single object (not an array). Passing a list
 * triggers their internal crash: "'list' object has no attribute 'get'".
 * `images` must be a comma-separated URL string when present.
 */
function buildReverseQcPayload(item: DelhiveryReversePickupItem) {
  const variant = [item.variant_size, item.variant_color]
    .filter(Boolean)
    .join(', ')
  const description = variant || item.product_name
  const imageUrl =
    typeof item.product_image === 'string' ? item.product_image.trim() : ''

  const qc: Record<string, string> = {
    item: item.product_name,
    descr: description,
    description,
    brand: process.env.DELHIVERY_SELLER_NAME || 'LFour37',
    product_category: 'Apparel',
    quantity: String(item.quantity),
    return_reason: item.return_reason || 'Customer return',
  }

  if (item.variant_size) qc.size = item.variant_size
  if (item.variant_color) qc.color = item.variant_color
  if (imageUrl) qc.images = imageUrl

  return qc
}

function isDelhiveryQcShapeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return (
    message.includes("has no attribute 'get'") ||
    message.includes('has no attribute "get"')
  )
}

async function postCmuCreate(shipmentData: {
  shipments: Record<string, unknown>[]
  pickup_location: { name: string }
}): Promise<unknown> {
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

/** Reverse pickup for returns and exchanges (payment_mode Pickup + optional QC). */
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
  const { pin, phone } = assertShipAddress(address)
  const location = await resolveDelhiveryPinLocation(pin)
  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  // Applies to return + exchange reverse legs (not the exchange forward shipment).
  const qcEnabled = process.env.DELHIVERY_RETURN_QC_ENABLED !== 'false'

  const shipment: Record<string, unknown> = {
    name: address.full_name,
    add: addressText,
    pin: location.pin,
    city: location.city,
    state: location.state,
    country: 'India',
    phone,
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
    seller_gst_tin: process.env.DELHIVERY_SELLER_GSTIN || '',
    return_name:
      process.env.DELHIVERY_RETURN_NAME || requiredEnv('DELHIVERY_SELLER_NAME'),
    return_add:
      process.env.DELHIVERY_RETURN_ADDRESS ||
      requiredEnv('DELHIVERY_SELLER_ADDRESS'),
    return_city: requiredEnv('DELHIVERY_RETURN_CITY'),
    return_state: requiredEnv('DELHIVERY_RETURN_STATE'),
    return_country: 'India',
    return_phone: normalizeIndianPhone(requiredEnv('DELHIVERY_RETURN_PHONE')),
    return_pin: normalizeIndianPin(requiredEnv('DELHIVERY_RETURN_PIN')),
  }

  const pickupLocation = { name: pickupName }

  if (qcEnabled) {
    const withQcResponse = await postCmuCreate({
      shipments: [
        {
          ...shipment,
          // Must be an object — Delhivery crashes on qc as a list
          qc: buildReverseQcPayload(item),
        },
      ],
      pickup_location: pickupLocation,
    })

    const withQcData = withQcResponse as DelhiveryCreateResponse
    const withQcError =
      withQcData?.packages?.[0]?.remarks?.join(', ') ||
      withQcData?.rmk ||
      withQcData?.remark ||
      (typeof withQcData?.error === 'string' ? withQcData.error : '') ||
      ''

    if (
      withQcData?.success !== false ||
      !isDelhiveryQcShapeError(withQcError)
    ) {
      return withQcResponse
    }

    logger.warn(
      'Delhivery reverse QC payload rejected; retrying without QC',
      { reference, error: withQcError }
    )
  }

  return postCmuCreate({
    shipments: [shipment],
    pickup_location: pickupLocation,
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
  const { pin, phone } = assertShipAddress(address)
  const location = await resolveDelhiveryPinLocation(pin)
  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  const shipmentData = {
    shipments: [
      {
        name: address.full_name,
        add: addressText,
        pin: location.pin,
        city: location.city,
        state: location.state,
        country: 'India',
        phone,
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
        return_phone: normalizeIndianPhone(requiredEnv('DELHIVERY_RETURN_PHONE')),
        return_pin: normalizeIndianPin(requiredEnv('DELHIVERY_RETURN_PIN')),
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
