/**
 * Company → Brand → Location helpers for Yadevi multi-brand ERP.
 *
 * Storefront apps set NEXT_PUBLIC_BRAND_SLUG (default: lfour37).
 * Admin brand selection uses the admin_brand_id cookie.
 */

export const YADEVI_COMPANY_ID = 'a0000000-0000-4000-8000-000000000001'
export const LFOUR37_BRAND_ID = 'b0000000-0000-4000-8000-000000000001'
export const TSHIRTKART_BRAND_ID = 'b0000000-0000-4000-8000-000000000002'
export const LFOUR37_WAREHOUSE_LOCATION_ID = 'c0000000-0000-4000-8000-000000000001'
export const LFOUR37_STORE_JAMNAGAR_LOCATION_ID = 'c0000000-0000-4000-8000-000000000002'

export const ADMIN_BRAND_COOKIE = 'admin_brand_id'
export const ADMIN_BRAND_ALL = 'all'

/** Read admin brand cookie in the browser (defaults to LFOUR37). */
export function getClientAdminBrandId(): string {
  if (typeof document === 'undefined') return LFOUR37_BRAND_ID
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${ADMIN_BRAND_COOKIE}=`))
  if (!match) return LFOUR37_BRAND_ID
  const value = decodeURIComponent(match.split('=').slice(1).join('='))
  if (!value || value === ADMIN_BRAND_ALL) return LFOUR37_BRAND_ID
  return value
}

export type LocationType = 'warehouse' | 'store' | 'other'
export type SalesChannel = 'online' | 'pos'

export interface Company {
  id: string
  name: string
  legal_name: string | null
  slug: string
  gstin: string | null
  address: string | null
  support_email: string | null
  support_phone: string | null
  is_active: boolean
}

export interface Brand {
  id: string
  company_id: string
  name: string
  slug: string
  display_name: string | null
  domain: string | null
  logo_url: string | null
  is_active: boolean
  sort_order: number
}

export interface Location {
  id: string
  company_id: string
  brand_id: string | null
  name: string
  code: string
  location_type: LocationType
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  is_active: boolean
  is_default_online: boolean
}

/** Brand slug for this storefront deployment. */
export function getStorefrontBrandSlug(): string {
  return (
    process.env.NEXT_PUBLIC_BRAND_SLUG?.trim().toLowerCase() ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim().toLowerCase().replace(/\s+/g, '') ||
    'lfour37'
  )
}

export function getStorefrontBrandIdFallback(): string {
  const slug = getStorefrontBrandSlug()
  if (slug.includes('tshirt')) return TSHIRTKART_BRAND_ID
  return LFOUR37_BRAND_ID
}
