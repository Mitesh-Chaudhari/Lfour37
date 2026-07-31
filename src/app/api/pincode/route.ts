import { NextRequest, NextResponse } from 'next/server'

const DELHIVERY_DEFAULT_BASE_URL = 'https://track.delhivery.com'
const LOOKUP_TIMEOUT_MS = 6000

/** Delhivery's pincode data uses 2-letter state codes */
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

interface DelhiveryLookup {
  city: string | null
  state: string | null
  serviceable: boolean
  codAvailable: boolean | null
}

interface IndiaPostLookup {
  city: string | null
  state: string | null
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

/** Delhivery pincode serviceability — authoritative since Delhivery ships our orders */
async function lookupDelhivery(pin: string): Promise<DelhiveryLookup | null> {
  const token = process.env.DELHIVERY_API_TOKEN
  if (!token) return null

  const baseUrl = (
    process.env.DELHIVERY_BASE_URL ||
    process.env.DELHIVERY_BASE_PRODUCTION_URL ||
    DELHIVERY_DEFAULT_BASE_URL
  ).replace(/\/$/, '')

  try {
    const res = await fetch(
      `${baseUrl}/c/api/pin-codes/json/?filter_codes=${pin}`,
      {
        headers: {
          Authorization: `Token ${token}`,
          Accept: 'application/json',
        },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      }
    )

    if (!res.ok) return null

    const body = await res.json()
    const postalCode = body?.delivery_codes?.[0]?.postal_code

    if (!postalCode) {
      return { city: null, state: null, serviceable: false, codAvailable: null }
    }

    const rawCity: string | undefined =
      postalCode.city || postalCode.district || undefined
    const stateCode: string | undefined = postalCode.state_code || undefined

    return {
      city: rawCity ? toTitleCase(rawCity) : null,
      state: stateCode
        ? (STATE_CODE_NAMES[stateCode.toUpperCase()] ?? null)
        : null,
      serviceable: true,
      codAvailable:
        typeof postalCode.cod === 'string'
          ? postalCode.cod.toUpperCase() === 'Y'
          : null,
    }
  } catch {
    return null
  }
}

/** India Post public API — free source for proper city/state names */
async function lookupIndiaPost(pin: string): Promise<IndiaPostLookup | null> {
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })

    if (!res.ok) return null

    const body = await res.json()
    const entry = Array.isArray(body) ? body[0] : null
    const postOffice = entry?.Status === 'Success' ? entry?.PostOffice?.[0] : null

    if (!postOffice) return null

    return {
      city: postOffice.District || null,
      state: postOffice.State || null,
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? ''

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: 'A valid 6-digit PIN code is required' },
      { status: 400 }
    )
  }

  const [delhivery, indiaPost] = await Promise.all([
    lookupDelhivery(code),
    lookupIndiaPost(code),
  ])

  return NextResponse.json({
    city: indiaPost?.city ?? delhivery?.city ?? null,
    state: indiaPost?.state ?? delhivery?.state ?? null,
    country: 'India',
    // null = serviceability unknown (Delhivery unreachable/not configured)
    serviceable: delhivery ? delhivery.serviceable : null,
    codAvailable: delhivery?.codAvailable ?? null,
  })
}
