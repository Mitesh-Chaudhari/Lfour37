export type AttributionData = {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  meta_campaign_id?: string | null
  meta_adset_id?: string | null
  meta_ad_id?: string | null
  gclid?: string | null
  fbclid?: string | null
}

const STORAGE_KEY = 'lfour37_attribution'
const SESSION_KEY = 'lfour37_session_id'

const ATTR_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'meta_campaign_id',
  'meta_adset_id',
  'meta_ad_id',
  'gclid',
  'fbclid',
] as const

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!match) return null
  return decodeURIComponent(match.slice(name.length + 1)) || null
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const existing = localStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`
    localStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return `sess_${Date.now()}`
  }
}

export function captureAttributionFromUrl(
  searchParams?: URLSearchParams | string
): AttributionData {
  if (typeof window === 'undefined') return {}

  const params =
    typeof searchParams === 'string'
      ? new URLSearchParams(searchParams)
      : searchParams || new URLSearchParams(window.location.search)

  const next: AttributionData = {}

  const utmSource = params.get('utm_source')
  const utmMedium = params.get('utm_medium')
  const utmCampaign = params.get('utm_campaign')
  const utmContent = params.get('utm_content')
  const utmTerm = params.get('utm_term')
  const gclid = params.get('gclid')
  const fbclid = params.get('fbclid')
  const metaCampaign =
    params.get('campaign_id') ||
    params.get('meta_campaign_id') ||
    params.get('utm_id')
  const metaAdset =
    params.get('adset_id') || params.get('meta_adset_id')
  const metaAd = params.get('ad_id') || params.get('meta_ad_id')

  if (utmSource) next.utm_source = utmSource
  if (utmMedium) next.utm_medium = utmMedium
  if (utmCampaign) next.utm_campaign = utmCampaign
  if (utmContent) next.utm_content = utmContent
  if (utmTerm) next.utm_term = utmTerm
  if (gclid) next.gclid = gclid
  if (fbclid) next.fbclid = fbclid
  if (metaCampaign) next.meta_campaign_id = metaCampaign
  if (metaAdset) next.meta_adset_id = metaAdset
  if (metaAd) next.meta_ad_id = metaAd

  // First-touch: only overwrite empty fields
  const existing = getStoredAttribution()
  const merged: AttributionData = { ...existing }
  for (const key of ATTR_KEYS) {
    if (!merged[key] && next[key]) merged[key] = next[key]
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // ignore
  }

  return merged
}

export function getStoredAttribution(): AttributionData {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as AttributionData
  } catch {
    return {}
  }
}

export function getAttributionForCheckout(): AttributionData {
  const stored = getStoredAttribution()
  const fbp = readCookie('_fbp')
  const fbc = readCookie('_fbc')

  return {
    ...stored,
    // Prefer URL-captured fbclid; cookie as weak fallback signal via content
    fbclid: stored.fbclid || (fbc ? fbc.split('.').pop() || null : null),
    utm_content: stored.utm_content || (fbp ? `fbp:${fbp}` : stored.utm_content),
  }
}

export function channelFromAttribution(attr: {
  utm_source?: string | null
  gclid?: string | null
  fbclid?: string | null
  meta_campaign_id?: string | null
}): string {
  const source = (attr.utm_source || '').toLowerCase()
  if (
    source.includes('facebook') ||
    source.includes('meta') ||
    source.includes('ig') ||
    source.includes('instagram') ||
    attr.meta_campaign_id ||
    attr.fbclid
  ) {
    if (source.includes('organic') || source === 'instagram') {
      return 'Instagram Organic'
    }
    return 'Meta Ads'
  }
  if (source.includes('google') || attr.gclid) return 'Google'
  if (source.includes('instagram')) return 'Instagram Organic'
  if (!source) return 'Direct'
  return attr.utm_source || 'Direct'
}
