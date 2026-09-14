'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { ADMIN_BRAND_ALL, ADMIN_BRAND_COOKIE } from '@/lib/organization'

type BrandOption = {
  id: string
  name: string
  slug: string
  is_active: boolean
}

interface BrandSwitcherProps {
  brands: BrandOption[]
  selectedBrandId: string
  collapsed?: boolean
}

function setBrandCookie(brandId: string) {
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${ADMIN_BRAND_COOKIE}=${encodeURIComponent(brandId)}; path=/; max-age=${maxAge}; samesite=lax`
}

export function BrandSwitcher({
  brands,
  selectedBrandId,
  collapsed = false,
}: BrandSwitcherProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (collapsed) {
    return (
      <div className="px-2 py-2" title="Brand filter">
        <span className="block truncate text-center text-[10px] font-semibold uppercase text-purple-300">
          {selectedBrandId === ADMIN_BRAND_ALL
            ? 'All'
            : brands.find((b) => b.id === selectedBrandId)?.name?.slice(0, 3) ||
              'Brand'}
        </span>
      </div>
    )
  }

  return (
    <div className="border-b border-gray-800 px-3 py-3">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Brand scope
      </label>
      <select
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-2 text-sm text-white outline-none focus:border-purple-500"
        value={selectedBrandId}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          setBrandCookie(next)
          startTransition(() => {
            router.refresh()
          })
        }}
      >
        <option value={ADMIN_BRAND_ALL}>Yadevi — All brands</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
            {!brand.is_active ? ' (inactive)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
