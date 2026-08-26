import { NextRequest, NextResponse } from 'next/server'
import { resolveDelhiveryPinLocation } from '@/lib/dtdc'

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

interface CarrierPinLookup {
  city: string | null
  state: string | null
  serviceable: boolean
  codAvailable: boolean | null
  remarks: string | null
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

function cleanLocationName(value: string): string {
  return value.replace(/\([A-Z]{2}\)\s*$/i, '').trim()
}

/** DTDC origin→destination pincode serviceability */
async function lookupDtdc(pin: string): Promise<CarrierPinLookup | null> {
  if (!process.env.DTDC_API_KEY || !process.env.DELHIVERY_RETURN_PIN) {
    return null
  }

  try {
    const location = await Promise.race([
      resolveDelhiveryPinLocation(pin),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), LOOKUP_TIMEOUT_MS)
      ),
    ])

    return {
      city: location.city || null,
      state: location.state || null,
      serviceable: true,
      codAvailable: location.codAvailable,
      remarks: location.remarks,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const blocked =
      message.includes('not serviceable') ||
      message.includes('does not support Cash on Delivery')

    if (blocked) {
      return {
        city: null,
        state: null,
        serviceable: false,
        codAvailable: message.includes('Cash on Delivery') ? false : null,
        remarks: message,
      }
    }

    // DTDC is configured but lookup failed/timed out — fail closed so checkout
    // cannot treat an unverified PIN as deliverable (prepaid orders were slipping through).
    return {
      city: null,
      state: null,
      serviceable: false,
      codAvailable: false,
      remarks:
        'Could not verify delivery for this PIN code. Please try again in a moment.',
    }
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
      city: postOffice.District
        ? cleanLocationName(postOffice.District)
        : null,
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

  const [carrier, indiaPost] = await Promise.all([
    lookupDtdc(code),
    lookupIndiaPost(code),
  ])

  return NextResponse.json({
    city: carrier?.city ?? indiaPost?.city ?? null,
    state: indiaPost?.state ?? carrier?.state ?? null,
    country: 'India',
    serviceable: carrier ? carrier.serviceable : null,
    codAvailable: carrier?.codAvailable ?? null,
    remarks: carrier?.remarks ?? null,
  })
}
