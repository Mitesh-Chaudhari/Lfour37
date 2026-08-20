import logger from '@/lib/logger'
import {
  formatDelhiveryCarrierStatus,
  isDelhiveryRtoDelivered,
  isDelhiveryRtoStatus,
  normalizeCarrierStatus,
} from '@/lib/delhivery-status'

export {
  formatDelhiveryCarrierStatus,
  isDelhiveryRtoDelivered,
  isDelhiveryRtoStatus,
  normalizeCarrierStatus,
} from '@/lib/delhivery-status'

const PX_BASE_DEFAULT = 'https://pxapi.dtdc.in'
const PINCODE_URL =
  'https://smarttrack-ctbsplus.dtdc.com/ratecalapi/PincodeApiCall'
const RATE_URL =
  'https://intranetapps.dtdc.in/dtdc-rateapi-0.0.1/dp/rate'
const TRACK_DETAILS_URL =
  'https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails'

export type DelhiveryOrder = {
  id: string
  order_number: string
  total: number
  payment_status: string
  payment_method?: string
  shipping_amount?: number | null
  cod_collect_amount?: number | null
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

export type DelhiveryReversePickupItem = {
  product_name: string
  quantity: number
  variant_size?: string | null
  variant_color?: string | null
  product_image?: string | null
  return_reason?: string | null
}

function pxBaseUrl(): string {
  return (
    process.env.DTDC_PX_BASE_URL || PX_BASE_DEFAULT
  ).replace(/\/$/, '')
}

function getPxConfig() {
  const apiKey = process.env.DTDC_API_KEY
  const customerCode = process.env.DTDC_CUSTOMER_CODE
  if (!apiKey) throw new Error('DTDC_API_KEY is not configured')
  if (!customerCode) throw new Error('DTDC_CUSTOMER_CODE is not configured')
  return { apiKey, customerCode }
}

function trackingToken(): string {
  return (
    process.env.DTDC_TRACKING_ACCESS_TOKEN ||
    process.env.DTDC_API_KEY ||
    ''
  )
}

function serviceTypeId(): string {
  return process.env.DTDC_SERVICE_TYPE_ID?.trim() || 'B2C PRIORITY'
}

function commodityId(): string {
  return process.env.DTDC_COMMODITY_ID?.trim() || '92'
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function todayDisplayDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function normalizeIndianPin(pin: string | null | undefined): string {
  return String(pin || '').replace(/\D/g, '').slice(0, 6)
}

export function normalizeIndianPhone(phone: string | null | undefined): string {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export function delhiveryChargeWeightGrams(itemCount = 1): number {
  const perPackage = Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500)
  const grams = Number.isFinite(perPackage) && perPackage > 0 ? perPackage : 500
  return Math.max(grams, grams * Math.max(1, itemCount))
}

function assertShipAddress(address: DelhiveryOrder['shipping_address']) {
  const pin = normalizeIndianPin(address.postal_code)
  const phone = normalizeIndianPhone(address.phone)

  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      `Invalid PIN code "${address.postal_code || ''}". A 6-digit Indian PIN is required.`
    )
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new Error(
      `Invalid phone "${address.phone || ''}". A 10-digit mobile number is required.`
    )
  }

  return { pin, phone }
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
    .slice(0, 250)
}

function totalQuantity(items: DelhiveryOrderItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}

/**
 * Brand warehouse printed on DTDC labels (FROM / pickup / return).
 * Single-warehouse store — keep this in sync with the physical pickup location.
 */
const WAREHOUSE = {
  name: 'Lfour37',
  address:
    'Shop No.2, Swagat Complex, Opp. Adidas Showroom, P N Marg, Jamnagar, 361008',
  city: 'Jamnagar',
  state: 'Gujarat',
  pin: '361008',
  phone: '9978437437',
} as const

/** Origin (FROM) block on forward DTDC labels + reverse destination. */
function warehouseOriginDetails() {
  return {
    name: WAREHOUSE.name,
    phone: normalizeIndianPhone(WAREHOUSE.phone),
    alternate_phone: '',
    address_line_1: WAREHOUSE.address,
    address_line_2: '',
    pincode: normalizeIndianPin(WAREHOUSE.pin),
    city: WAREHOUSE.city,
    state: WAREHOUSE.state,
  }
}

/** Return / RTO address (same as pickup for Lfour37). */
function warehouseReturnDetails() {
  return {
    name: WAREHOUSE.name,
    phone: normalizeIndianPhone(WAREHOUSE.phone),
    alternate_phone: '',
    address_line_1: WAREHOUSE.address,
    address_line_2: '',
    city_name: WAREHOUSE.city,
    state_name: WAREHOUSE.state,
    pincode: normalizeIndianPin(WAREHOUSE.pin),
    email: '',
    latitude: '',
    longitude: '',
  }
}

function customerDestinationDetails(
  address: DelhiveryOrder['shipping_address'],
  pin: string,
  phone: string,
  location?: { city: string; state: string }
) {
  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  return {
    name: address.full_name,
    phone,
    alternate_phone: '',
    address_line_1: addressText,
    address_line_2: '',
    pincode: pin,
    city: location?.city || address.city,
    state: location?.state || address.state,
  }
}

async function pxRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { apiKey } = getPxConfig()
  const response = await fetch(`${pxBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'api-key': apiKey,
      ...init.headers,
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // label stream may be binary/plain
  }

  if (!response.ok) {
    logger.error('DTDC PX API request failed', {
      path,
      status: response.status,
      body,
    })
    throw new Error(`DTDC API returned HTTP ${response.status}`)
  }

  return body as T
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function epochMsToIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  const asNum = Number(value)
  if (Number.isFinite(asNum) && asNum > 1_000_000_000_000) {
    return new Date(asNum).toISOString()
  }
  return null
}

function dtdcDateTimeToIso(date?: string | null, time?: string | null): string | null {
  if (!date || date.length !== 8) return null
  const day = date.slice(0, 2)
  const month = date.slice(2, 4)
  const year = date.slice(4, 8)
  const hh = (time || '0000').padStart(4, '0').slice(0, 2)
  const mm = (time || '0000').padStart(4, '0').slice(2, 4)
  const parsed = new Date(`${year}-${month}-${day}T${hh}:${mm}:00+05:30`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

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

  const originPin = normalizeIndianPin(
    process.env.DELHIVERY_RETURN_PIN?.trim() || WAREHOUSE.pin
  )
  if (!/^\d{6}$/.test(originPin)) {
    throw new Error('Origin PIN is not configured')
  }

  const response = await fetch(PINCODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      orgPincode: originPin,
      desPincode: normalizedPin,
    }),
    cache: 'no-store',
  })

  const body = (await response.json()) as {
    ZIPCODE_RESP?: Array<{
      SERVFLAG?: string
      SERV_COD?: string
      DESTPIN?: string
    }>
    PIN_CITY?: Array<{ CITY?: string; PIN?: string }>
    SERV_LIST?: Array<{ COD_Serviceable?: string }>
    errorMessage?: string
  }

  if (!response.ok) {
    throw new Error(
      body?.errorMessage ||
        `PIN ${normalizedPin} is not serviceable on DTDC for this account`
    )
  }

  const zip = body?.ZIPCODE_RESP?.[0]
  const servFlag = String(zip?.SERVFLAG || '').toUpperCase()
  const codFlag =
    String(zip?.SERV_COD || body?.SERV_LIST?.[0]?.COD_Serviceable || '').toUpperCase()

  const serviceable = servFlag === 'Y'
  const codAvailable = codFlag === 'Y' || codFlag === 'YES'

  if (!serviceable) {
    throw new Error(
      `PIN ${normalizedPin} is not serviceable on DTDC for this account`
    )
  }

  if (options.requireCod && !codAvailable) {
    throw new Error(
      `PIN ${normalizedPin} does not support Cash on Delivery on DTDC. Ask the customer to pay online, or ship as Prepaid.`
    )
  }

  const destCityRow =
    body?.PIN_CITY?.find((row) => String(row.PIN || '') === normalizedPin) ||
    body?.PIN_CITY?.find((row) => String(row.PIN || '') !== originPin) ||
    body?.PIN_CITY?.[0]

  const city = String(destCityRow?.CITY || '').trim()

  return {
    pin: normalizedPin,
    city: city || normalizedPin,
    state: '',
    stateCode: '',
    codAvailable,
    remarks: null,
  }
}

type SoftdataConsignment = Record<string, unknown>

function buildForwardConsignment({
  order,
  items,
  reference,
}: {
  order: DelhiveryOrder
  items: DelhiveryOrderItem[]
  reference: string
}): SoftdataConsignment {
  const { customerCode } = getPxConfig()
  const address = order.shipping_address
  const { pin, phone } = assertShipAddress(address)
  const isCod = order.payment_method === 'cod'
  const collectAmount = isCod
    ? Number(
        order.cod_collect_amount ??
          Math.max(
            0,
            Number(order.total || 0) - Number(order.shipping_amount || 0)
          )
      )
    : 0

  const weightKg = (
    Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500) / 1000
  ).toFixed(2)

  return {
    customer_code: customerCode,
    service_type_id: serviceTypeId(),
    load_type: 'NON-DOCUMENT',
    consignment_type: 'Forward',
    description: shipmentDescription(items),
    dimension_unit: 'cm',
    length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
    width: process.env.DELHIVERY_DEFAULT_WIDTH_CM || '20',
    height: process.env.DELHIVERY_DEFAULT_HEIGHT_CM || '5',
    weight_unit: 'kg',
    weight: weightKg,
    declared_value: String(isCod ? collectAmount || order.total : order.total),
    num_pieces: String(totalQuantity(items)),
    origin_details: warehouseOriginDetails(),
    destination_details: customerDestinationDetails(address, pin, phone),
    return_details: warehouseReturnDetails(),
    customer_reference_number: reference,
    commodity_id: commodityId(),
    is_risk_surcharge_applicable: false,
    invoice_number: reference,
    invoice_date: todayDisplayDate(),
    reference_number: '',
    cod_collection_mode: isCod ? 'CASH' : '',
    cod_amount: isCod ? String(collectAmount || order.total) : '',
    cod_favor_of: '',
    pieces_detail: [
      {
        description: shipmentDescription(items),
        declared_value: String(order.total),
        weight: weightKg,
        height: process.env.DELHIVERY_DEFAULT_HEIGHT_CM || '5',
        length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
        width: process.env.DELHIVERY_DEFAULT_WIDTH_CM || '20',
      },
    ],
  }
}

async function postSoftdata(consignment: SoftdataConsignment): Promise<unknown> {
  return pxRequest('/api/customer/integration/consignment/softdata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consignments: [consignment] }),
  })
}

export async function createShipment({
  order,
  items,
}: {
  order: DelhiveryOrder
  items: DelhiveryOrderItem[]
}): Promise<unknown> {
  const address = order.shipping_address
  const { pin } = assertShipAddress(address)
  const isCod = order.payment_method === 'cod'
  await resolveDelhiveryPinLocation(pin, { requireCod: isCod })

  return postSoftdata(
    buildForwardConsignment({
      order,
      items,
      reference: order.order_number,
    })
  )
}

export function formatDelhiveryError(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('serviceability') || normalized.includes('pincode')) {
    return `${message} Verify origin/destination PINs are serviceable for your DTDC account.`
  }

  if (normalized.includes('wrong api key') || normalized.includes('no_api_key')) {
    return `${message} Check DTDC_API_KEY and DTDC_CUSTOMER_CODE.`
  }

  return message
}

type DtdcCreateResponse = {
  status?: string
  data?: Array<{
    success?: boolean
    reference_number?: string
    remarks?: string[]
    reason?: string
    message?: string
  }>
  error?: { message?: string }
}

export function parseShipmentCreationResponse(response: unknown): {
  awb: string
  status: string
} {
  const data = response as DtdcCreateResponse
  const shipment = data?.data?.[0]
  const awb = shipment?.reference_number?.trim()

  if (data?.status !== 'OK' || shipment?.success === false || !awb) {
    const details =
      shipment?.message ||
      shipment?.remarks?.join(', ') ||
      shipment?.reason ||
      data?.error?.message ||
      'DTDC did not return an AWB'
    throw new Error(formatDelhiveryError(`Shipment creation failed: ${details}`))
  }

  return {
    awb,
    status: 'Booked',
  }
}

async function trackViaCustomerApi(
  awb: string
): Promise<NormalizedDelhiveryTracking | null> {
  try {
    const response = await pxRequest<{
      reference_number?: string
      status?: string
      expected_delivery_date?: string | null
      events?: Array<{
        type?: string
        customer_update?: string
        event_time?: number
        hub_name?: string
        failure_reason?: string | null
        notes?: string | null
      }>
    }>(
      `/api/customer/integration/consignment/track?reference_number=${encodeURIComponent(awb)}`
    )

    const events = (response.events || []).map((event) => ({
      status: asString(event.customer_update) || asString(event.type) || 'Unknown',
      statusCode: asString(event.type),
      statusType: asString(event.type)?.toUpperCase().startsWith('RTO')
        ? 'RT'
        : null,
      location: asString(event.hub_name),
      instructions: asString(event.failure_reason) || asString(event.notes),
      occurredAt: epochMsToIso(event.event_time),
    }))

    const currentStatus = asString(response.status) || events[0]?.status || 'Unknown'

    const deliveredEvent = [...events]
      .reverse()
      .find(
        (event) =>
          event.statusCode === 'DLV' ||
          event.status.toLowerCase().includes('delivered')
      )

    return {
      awb: asString(response.reference_number) || awb,
      currentStatus,
      statusCode: events[0]?.statusCode || null,
      statusType: events[0]?.statusType || null,
      instructions: events[0]?.instructions || null,
      expectedDeliveryDate: asString(response.expected_delivery_date),
      deliveredAt: deliveredEvent?.occurredAt || null,
      events,
      raw: response,
    }
  } catch (error) {
    logger.warn('DTDC customer track API failed; trying pull API', { awb, error })
    return null
  }
}

async function trackViaPullApi(
  awb: string
): Promise<NormalizedDelhiveryTracking> {
  const token = trackingToken()
  if (!token) {
    throw new Error('DTDC tracking token is not configured')
  }

  const response = await fetch(TRACK_DETAILS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
    body: JSON.stringify({
      TrkType: 'cnno',
      strcnno: awb,
      addtnlDtl: 'Y',
    }),
    cache: 'no-store',
  })

  const body = (await response.json()) as {
    status?: string
    statusFlag?: boolean
    trackHeader?: {
      strShipmentNo?: string
      strStatus?: string
      strExpectedDeliveryDate?: string
      strRemarks?: string
      strRtoNumber?: string
    }
    trackDetails?: Array<{
      strCode?: string
      strAction?: string
      strOrigin?: string
      sTrRemarks?: string
      strActionDate?: string
      strActionTime?: string
    }>
    errorDetails?: unknown
  }

  if (!response.ok || body.status !== 'SUCCESS') {
    throw new Error('DTDC tracking response has no shipment data')
  }

  const header = body.trackHeader
  const events = (body.trackDetails || []).map((scan) => ({
    status: asString(scan.strAction) || 'Unknown',
    statusCode: asString(scan.strCode),
    statusType:
      asString(scan.strCode)?.toUpperCase().startsWith('RTO') ||
      asString(scan.strAction)?.toUpperCase().includes('RTO')
        ? 'RT'
        : null,
    location: asString(scan.strOrigin),
    instructions: asString(scan.sTrRemarks),
    occurredAt: dtdcDateTimeToIso(scan.strActionDate, scan.strActionTime),
  }))

  const currentStatus = asString(header?.strStatus) || events.at(-1)?.status || 'Unknown'
  const latest = events.at(-1)

  const deliveredEvent = [...events]
    .reverse()
    .find(
      (event) =>
        event.statusCode === 'DLV' ||
        (event.status.toLowerCase().includes('delivered') &&
          !event.status.toLowerCase().includes('not delivered'))
    )

  return {
    awb: asString(header?.strShipmentNo) || awb,
    currentStatus,
    statusCode: latest?.statusCode || null,
    statusType: latest?.statusType || null,
    instructions: asString(header?.strRemarks),
    expectedDeliveryDate: asString(header?.strExpectedDeliveryDate),
    deliveredAt: deliveredEvent?.occurredAt || null,
    events,
    raw: body,
  }
}

export async function trackDtdcShipment(
  awb: string
): Promise<NormalizedDelhiveryTracking> {
  const customer = await trackViaCustomerApi(awb)
  if (customer) return customer
  return trackViaPullApi(awb)
}

export function normalizeTrackingResponse(
  response: unknown,
  fallbackAwb: string
): NormalizedDelhiveryTracking {
  return response as NormalizedDelhiveryTracking
}

const PRE_PICKUP_CODES = new Set([
  'PCAW',
  'PCSC',
  'PCRA',
  'PCAN',
  'SPL',
  'BKD',
  'DRAW',
  'DRSC',
])

const PICKED_UP_CODES = new Set(['PCUP', 'DRCOM'])
const OFD_CODES = new Set(['OUTDLV', 'RTOOUTDLV'])
const DELIVERED_CODES = new Set(['DLV', 'RTODLV'])
const RTO_CODES = new Set([
  'IRTO',
  'SETRTO',
  'RTO',
  'RTOOPMF',
  'RTOIPMF',
  'RTOOBMD',
  'RTOIBMD',
  'RTOOBMN',
  'RTOIBMN',
  'RTOOMBM',
  'RTOORMF',
  'RTOIRMF',
  'RTOIMBM',
  'RTOORBO',
  'RTOIRBO',
  'RTOCDOUT',
  'RTOCDIN',
  'RTORADCDIN',
  'RTOOUTDLV',
  'RTONONDLV',
  'RTODLV',
  'RTOW',
  'RTOINSCAN',
  'RTOBKD',
])

export function isDelhiveryPrePickupStatus(status: string, statusCode?: string | null): boolean {
  const code = (statusCode || '').toUpperCase()
  if (PRE_PICKUP_CODES.has(code)) return true

  const normalized = normalizeCarrierStatus(status)
  return (
    normalized.includes('pickup awaited') ||
    normalized.includes('pickup scheduled') ||
    normalized.includes('softdata') ||
    normalized.includes('booked') ||
    normalized.includes('awaited') ||
    normalized.includes('scheduled') ||
    normalized.includes('pending') ||
    normalized.includes('creating')
  )
}

export function isDelhiveryPickedUpStatus(
  status: string,
  statusCode?: string | null
): boolean {
  const code = (statusCode || '').toUpperCase()
  if (PICKED_UP_CODES.has(code)) return true
  if (isDelhiveryPrePickupStatus(status, statusCode)) return false

  const normalized = normalizeCarrierStatus(status)
  return normalized.includes('picked up') || normalized === 'picked up'
}

export function isDelhiveryOutForDelivery(
  status: string,
  statusType?: string | null,
  instructions?: string | null,
  statusCode?: string | null
): boolean {
  const code = (statusCode || '').toUpperCase()
  if (OFD_CODES.has(code)) {
    return code === 'OUTDLV'
  }

  const normalized = normalizeCarrierStatus(status)
  if (normalized.includes('out for delivery')) {
    return !normalized.includes('rto')
  }

  if (normalized.includes('dispatched') && statusType !== 'RT') {
    return true
  }

  void instructions
  return false
}

export function mapDelhiveryStatusToOrderStatus(
  status: string,
  statusType?: string | null,
  instructions?: string | null,
  statusCode?: string | null
): 'processing' | 'shipped' | 'delivered' | 'cancelled' | null {
  const code = (statusCode || '').toUpperCase()
  const isRto =
    statusType === 'RT' ||
    RTO_CODES.has(code) ||
    isDelhiveryRtoStatus(status, statusType, instructions)

  if (normalizeCarrierStatus(status).includes('cancel') && !isRto) {
    return 'cancelled'
  }

  if (isDelhiveryRtoDelivered(status, statusType, instructions, statusCode)) {
    return 'cancelled'
  }

  if (isRto) return 'shipped'

  if (
    DELIVERED_CODES.has(code) ||
    (normalizeCarrierStatus(status).includes('delivered') &&
      !normalizeCarrierStatus(status).includes('not delivered') &&
      !normalizeCarrierStatus(status).includes('undelivered'))
  ) {
    return 'delivered'
  }

  if (isDelhiveryPrePickupStatus(status, statusCode)) {
    return 'processing'
  }

  if (
    normalizeCarrierStatus(status).includes('in transit') ||
    isDelhiveryOutForDelivery(status, statusType, instructions, statusCode) ||
    isDelhiveryPickedUpStatus(status, statusCode)
  ) {
    return 'shipped'
  }

  return null
}

export function getTrackingMilestone(
  status: string,
  statusType?: string | null,
  instructions?: string | null,
  statusCode?: string | null
): string {
  const normalized = normalizeCarrierStatus(status)
  const code = (statusCode || '').toUpperCase()

  if (normalized.includes('cancel') && !isDelhiveryRtoStatus(status, statusType, instructions)) {
    return 'cancelled'
  }

  if (isDelhiveryRtoStatus(status, statusType, instructions) || RTO_CODES.has(code)) {
    if (isDelhiveryRtoDelivered(status, statusType, instructions, statusCode)) {
      return 'rto_delivered'
    }
    return 'return_to_origin'
  }

  if (isDelhiveryOutForDelivery(status, statusType, instructions, statusCode)) {
    return 'out_for_delivery'
  }

  if (
    DELIVERED_CODES.has(code) ||
    (normalized.includes('delivered') &&
      !normalized.includes('undelivered') &&
      !normalized.includes('not delivered'))
  ) {
    return 'delivered'
  }

  if (
    normalized.includes('undelivered') ||
    normalized.includes('not delivered') ||
    code === 'NONDLV' ||
    normalized.includes('failed') ||
    normalized.includes('exception')
  ) {
    return 'delivery_exception'
  }

  if (isDelhiveryPrePickupStatus(status, statusCode)) {
    return 'shipment_created'
  }

  if (isDelhiveryPickedUpStatus(status, statusCode)) {
    return 'picked_up'
  }

  if (normalized.includes('in transit') || code.endsWith('MF') || code.endsWith('MD')) {
    return 'in_transit'
  }

  return 'shipment_update'
}

export function isDelhiveryStatusCancellable(
  status: string,
  statusType?: string | null,
  instructions?: string | null,
  statusCode?: string | null
): boolean {
  if (isDelhiveryOutForDelivery(status, statusType, instructions, statusCode)) {
    return false
  }

  const normalized = status.toLowerCase()
  if (normalized.includes('delivered') && !normalized.includes('undelivered')) {
    return false
  }

  if (
    isDelhiveryRtoStatus(status, statusType, instructions) ||
    normalized.includes('cancel')
  ) {
    return false
  }

  const code = (statusCode || '').toUpperCase()
  if (['PCUP', 'OUTDLV', 'DLV', 'NONDLV'].includes(code)) {
    return false
  }

  return true
}

export function mapDelhiveryReverseStatus(
  status: string,
  statusCode?: string | null
): 'picked_up' | 'in_transit' | 'delivered_to_origin' | 'cancelled' | null {
  const code = (statusCode || '').toUpperCase()
  const normalized = status.toLowerCase()

  if (code === 'RTODLV' || normalized.includes('rto delivered')) {
    return 'delivered_to_origin'
  }
  if (normalized.includes('cancel') || code === 'PCAN') {
    return 'cancelled'
  }
  if (
    normalized.includes('in transit') ||
    normalized.includes('out for delivery') ||
    code.startsWith('RTO')
  ) {
    return 'in_transit'
  }
  if (code === 'PCUP' || normalized.includes('picked up')) {
    return 'picked_up'
  }

  return null
}

export function getReversePickupMilestone(
  status: string,
  statusType?: string | null,
  statusCode?: string | null
): 'reverse_picked_up' | 'reverse_dto' | null {
  const code = (statusCode || '').toUpperCase()
  const normalized = status.toLowerCase()

  if (code === 'RTODLV' || normalized.includes('delivered to origin')) {
    return 'reverse_dto'
  }

  if (normalized.includes('cancel') || code === 'PCAN') {
    return null
  }

  if (code === 'PCUP' || normalized.includes('picked up')) {
    return 'reverse_picked_up'
  }

  void statusType
  return null
}

/** DTDC has no edit-order API in our docs; COD→prepaid is handled in-app only. */
export async function updateShipmentToPrepaid(awb: string): Promise<unknown> {
  logger.info('DTDC updateShipmentToPrepaid skipped (no carrier edit API)', { awb })
  return { ok: true, skipped: true, awb }
}

export async function cancelShipment(awb: string): Promise<unknown> {
  const { customerCode } = getPxConfig()
  return pxRequest('/api/customer/integration/consignment/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      AWBNo: [awb],
      customerCode,
    }),
  })
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
  const address = order.shipping_address
  const { pin, phone } = assertShipAddress(address)
  await resolveDelhiveryPinLocation(pin)

  const addressText = [address.address_line1, address.address_line2]
    .filter(Boolean)
    .join(', ')

  const weightKg = (
    Number(process.env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500) / 1000
  ).toFixed(2)

  const warehouse = warehouseOriginDetails()
  const returnDetails = warehouseReturnDetails()

  return postSoftdata({
    customer_code: getPxConfig().customerCode,
    service_type_id: serviceTypeId(),
    load_type: 'NON-DOCUMENT',
    consignment_type: 'Reverse',
    description: item.product_name,
    dimension_unit: 'cm',
    length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
    width: process.env.DELHIVERY_DEFAULT_WIDTH_CM || '20',
    height: process.env.DELHIVERY_DEFAULT_HEIGHT_CM || '5',
    weight_unit: 'kg',
    weight: weightKg,
    declared_value: String(order.total),
    num_pieces: String(item.quantity),
    origin_details: {
      name: address.full_name,
      phone,
      alternate_phone: '',
      address_line_1: addressText,
      address_line_2: '',
      pincode: pin,
      city: address.city,
      state: address.state,
    },
    destination_details: {
      name: warehouse.name,
      phone: warehouse.phone,
      alternate_phone: '',
      address_line_1: warehouse.address_line_1,
      address_line_2: '',
      pincode: warehouse.pincode,
      city: warehouse.city,
      state: warehouse.state,
    },
    return_details: returnDetails,
    customer_reference_number: reference,
    commodity_id: commodityId(),
    is_risk_surcharge_applicable: false,
    reference_number: '',
    cod_collection_mode: '',
    cod_amount: '',
    pieces_detail: [
      {
        description: item.product_name,
        declared_value: String(order.total),
        weight: weightKg,
        height: process.env.DELHIVERY_DEFAULT_HEIGHT_CM || '5',
        length: process.env.DELHIVERY_DEFAULT_LENGTH_CM || '25',
        width: process.env.DELHIVERY_DEFAULT_WIDTH_CM || '20',
      },
    ],
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
  const exchangeOrder: DelhiveryOrder = {
    ...order,
    total: 0,
    payment_method: 'prepaid',
    cod_collect_amount: 0,
  }

  return postSoftdata(
    buildForwardConsignment({
      order: exchangeOrder,
      items: [item],
      reference,
    })
  )
}

export async function quoteDtdcRate(
  destinationPin: string,
  options: {
    weightKg: number
    invoiceValue: number
    codAmount?: number
    mode?: 'AIR' | 'SURFACE'
  }
): Promise<{ total: number; serviceCode?: string; serviceName?: string }> {
  const token = process.env.DTDC_RATE_API_TOKEN
  const { customerCode } = getPxConfig()
  const originPin = normalizeIndianPin(
    process.env.DELHIVERY_RETURN_PIN?.trim() || WAREHOUSE.pin
  )

  if (!token) {
    throw new Error('DTDC_RATE_API_TOKEN is not configured')
  }

  const mode =
    options.mode ||
    (process.env.DTDC_SHIPPING_MODE?.toUpperCase().startsWith('A') ? 'AIR' : 'SURFACE')

  const response = await fetch(RATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
    body: JSON.stringify({
      originPincode: originPin,
      destPincode: destinationPin,
      weight: options.weightKg,
      expectedBookingDate: todayIsoDate(),
      invoiceValue: options.invoiceValue,
      mode,
      pieces: '1',
      documentType: 'N',
      insured: 'N',
      codAmount: options.codAmount ? String(options.codAmount) : '0',
      customerCode,
    }),
    cache: 'no-store',
  })

  const body = (await response.json()) as {
    status?: boolean
    message?: string
    errorMessage?: string | null
    serviceCode?: Array<{
      serviceCode?: string
      serviceName?: string
      totalAmount?: string
    }>
  }

  if (!response.ok || body.status === false) {
    throw new Error(
      body.errorMessage || body.message || 'Could not fetch DTDC shipping charges'
    )
  }

  const services = (body.serviceCode || [])
    .map((row) => ({
      serviceCode: row.serviceCode,
      serviceName: row.serviceName,
      total: Number(row.totalAmount || 0),
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => a.total - b.total)

  const preferred =
    services.find((row) =>
      String(row.serviceName || '')
        .toUpperCase()
        .includes('B2C PRIORITY')
    ) || services[0]

  if (!preferred) {
    throw new Error('DTDC returned zero shipping charges')
  }

  return {
    total: Math.ceil(preferred.total),
    serviceCode: preferred.serviceCode,
    serviceName: preferred.serviceName,
  }
}
