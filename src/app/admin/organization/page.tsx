import { createClient } from '@/lib/supabase/server'
import { OrganizationClient } from '@/components/admin/organization-client'
import { YADEVI_COMPANY_ID } from '@/lib/organization'

export const dynamic = 'force-dynamic'

export default async function OrganizationPage() {
  const supabase = await createClient()

  const [{ data: company }, { data: brands }, { data: locations }] =
    await Promise.all([
      supabase
        .from('companies')
        .select(
          'id, name, legal_name, slug, gstin, address, support_email, support_phone'
        )
        .eq('id', YADEVI_COMPANY_ID)
        .maybeSingle(),
      supabase
        .from('brands')
        .select(
          'id, name, slug, display_name, domain, is_active, sort_order'
        )
        .order('sort_order', { ascending: true }),
      supabase
        .from('locations')
        .select(
          'id, name, code, location_type, brand_id, city, state, is_default_online, is_active'
        )
        .order('name', { ascending: true }),
    ])

  return (
    <OrganizationClient
      company={company}
      brands={brands || []}
      locations={locations || []}
    />
  )
}
