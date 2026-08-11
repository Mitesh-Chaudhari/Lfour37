'use client'

import { useEffect, useState } from 'react'
import type { ListingProduct } from '@/lib/catalog-queries'
import { ProductSection } from '@/components/home/product-section'
import {
  getRecentlyViewedIds,
  trackRecentlyViewed,
} from '@/lib/recently-viewed'

interface RecentlyViewedSectionProps {
  currentProductId: string
}

export function RecentlyViewedSection({
  currentProductId,
}: RecentlyViewedSectionProps) {
  const [products, setProducts] = useState<ListingProduct[]>([])

  useEffect(() => {
    trackRecentlyViewed(currentProductId)

    const ids = getRecentlyViewedIds(currentProductId).slice(0, 8)
    if (!ids.length) {
      setProducts([])
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(
          `/api/products/by-ids?ids=${encodeURIComponent(ids.join(','))}`
        )
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setProducts((data.products || []) as ListingProduct[])
        }
      } catch {
        if (!cancelled) setProducts([])
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [currentProductId])

  if (!products.length) return null

  return (
    <div className="mt-8">
      <ProductSection title="Recently Viewed" products={products} />
    </div>
  )
}
