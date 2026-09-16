import { cookies } from 'next/headers'
import { createClient, createPublicClient } from '@/lib/supabase/server'
import {
  ADMIN_BRAND_ALL,
  ADMIN_BRAND_COOKIE,
  LFOUR37_BRAND_ID,
  LFOUR37_ONLINE_LOCATION_ID,
  LFOUR37_WAREHOUSE_LOCATION_ID,
  YADEVI_COMPANY_ID,
  getStorefrontBrandIdFallback,
  getStorefrontBrandSlug,
  type Brand,
  type Company,
  type Location,
} from '@/lib/organization'

type BrandRow = Pick<
  Brand,
  | 'id'
  | 'company_id'
  | 'name'
  | 'slug'
  | 'display_name'
  | 'domain'
  | 'logo_url'
  | 'is_active'
  | 'sort_order'
>

export async function getCompany(): Promise<Company | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('companies')
    .select(
      'id, name, legal_name, slug, gstin, address, support_email, support_phone, is_active'
    )
    .eq('id', YADEVI_COMPANY_ID)
    .maybeSingle()
  return data
}

export async function listBrands(options?: {
  activeOnly?: boolean
  includeInactiveForAdmin?: boolean
}): Promise<BrandRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('brands')
    .select(
      'id, company_id, name, slug, display_name, domain, logo_url, is_active, sort_order'
    )
    .order('sort_order', { ascending: true })

  if (options?.activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data } = await query
  return data || []
}

export async function listLocations(brandId?: string | null): Promise<Location[]> {
  const supabase = await createClient()
  let query = supabase
    .from('locations')
    .select(
      'id, company_id, brand_id, name, code, location_type, address, city, state, postal_code, is_active, is_default_online'
    )
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (brandId) {
    query = query.eq('brand_id', brandId)
  }

  const { data } = await query
  return (data || []) as Location[]
}

export async function getBrandBySlug(slug: string): Promise<BrandRow | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('brands')
    .select(
      'id, company_id, name, slug, display_name, domain, logo_url, is_active, sort_order'
    )
    .eq('slug', slug.toLowerCase())
    .maybeSingle()
  return data
}

/** Resolve brand for this storefront (lfour37.com / future tshirtkart). */
export async function getStorefrontBrand(): Promise<BrandRow> {
  const slug = getStorefrontBrandSlug()
  const brand = await getBrandBySlug(slug)
  if (brand) return brand

  return {
    id: getStorefrontBrandIdFallback(),
    company_id: YADEVI_COMPANY_ID,
    name: slug === 'tshirtkart' ? 'TshirtKart' : 'LFOUR37',
    slug,
    display_name: slug === 'tshirtkart' ? 'TshirtKart' : 'Lfour37',
    domain: null,
    logo_url: null,
    is_active: true,
    sort_order: 1,
  }
}

export async function getStorefrontBrandId(): Promise<string> {
  const brand = await getStorefrontBrand()
  return brand.id
}

export async function getDefaultOnlineLocationId(
  brandId: string
): Promise<string> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('locations')
    .select('id')
    .eq('brand_id', brandId)
    .eq('is_default_online', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  return data?.id || LFOUR37_ONLINE_LOCATION_ID
}

/** Admin selected brand cookie — `all` means company-wide view. */
export async function getAdminSelectedBrandId(): Promise<string | typeof ADMIN_BRAND_ALL> {
  const jar = await cookies()
  const value = jar.get(ADMIN_BRAND_COOKIE)?.value
  if (!value) return LFOUR37_BRAND_ID
  if (value === ADMIN_BRAND_ALL) return ADMIN_BRAND_ALL
  return value
}

export async function getAdminBrandFilterId(): Promise<string | null> {
  const selected = await getAdminSelectedBrandId()
  if (selected === ADMIN_BRAND_ALL) return null
  return selected
}
