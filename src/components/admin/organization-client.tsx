'use client'

import { Building2, MapPin, Store } from 'lucide-react'

type Company = {
  id: string
  name: string
  legal_name: string | null
  slug: string
  gstin: string | null
  address: string | null
  support_email: string | null
  support_phone: string | null
}

type Brand = {
  id: string
  name: string
  slug: string
  display_name: string | null
  domain: string | null
  is_active: boolean
  sort_order: number
}

type LocationRow = {
  id: string
  name: string
  code: string
  location_type: string
  brand_id: string | null
  city: string | null
  state: string | null
  is_default_online: boolean
  is_active: boolean
}

interface OrganizationClientProps {
  company: Company | null
  brands: Brand[]
  locations: LocationRow[]
}

export function OrganizationClient({
  company,
  brands,
  locations,
}: OrganizationClientProps) {
  const brandName = (id: string | null) =>
    brands.find((b) => b.id === id)?.name || 'Company-wide'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization</h1>
        <p className="mt-1 text-sm text-gray-600">
          Yadevi Lifestyle company structure — brands and outlets. Catalog and
          stock stay brand-scoped; storefronts read from the same backend.
        </p>
      </div>

      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Company</h2>
        </div>
        {company ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium">{company.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Legal name</dt>
              <dd className="font-medium">{company.legal_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Slug</dt>
              <dd className="font-mono text-xs">{company.slug}</dd>
            </div>
            <div>
              <dt className="text-gray-500">GSTIN</dt>
              <dd className="font-medium">{company.gstin || 'Not set yet'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Address</dt>
              <dd className="font-medium">{company.address || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Support email</dt>
              <dd className="font-medium">{company.support_email || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Support phone</dt>
              <dd className="font-medium">{company.support_phone || '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-amber-700">
            Company row not found. Run migration{' '}
            <code className="rounded bg-amber-50 px-1">046_company_brand_locations.sql</code>{' '}
            on Supabase.
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Store className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Brands</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Slug</th>
                <th className="py-2 pr-4">Domain</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{brand.name}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{brand.slug}</td>
                  <td className="py-3 pr-4">{brand.domain || '—'}</td>
                  <td className="py-3">
                    <span
                      className={
                        brand.is_active
                          ? 'rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700'
                          : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600'
                      }
                    >
                      {brand.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {brands.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-gray-500">
                    No brands yet — run the organization migration.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Locations</h2>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Stock is still one shared quantity per variant (online + store).
          Locations tag where sales happen; POS will use the store location.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Brand</th>
                <th className="py-2">Online default</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{loc.name}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{loc.code}</td>
                  <td className="py-3 pr-4 capitalize">{loc.location_type}</td>
                  <td className="py-3 pr-4">{brandName(loc.brand_id)}</td>
                  <td className="py-3">
                    {loc.is_default_online ? 'Yes' : '—'}
                  </td>
                </tr>
              ))}
              {locations.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-gray-500">
                    No locations yet — run the organization migration.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
