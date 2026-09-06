'use client'

import { useEffect, useState } from 'react'
import { ProductSection } from '@/components/home/product-section'
import {
  getRecentlyViewedIds,
  trackRecentlyViewed,
} from '@/lib/recently-viewed'
import { useProductsByIds } from '@/hooks/use-products-by-ids'

interface RecentlyViewedSectionProps {
  currentProductId: string
}

export function RecentlyViewedSection({
  currentProductId,
}: RecentlyViewedSectionProps) {
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    trackRecentlyViewed(currentProductId)
    setIds(getRecentlyViewedIds(currentProductId).slice(0, 8))
  }, [currentProductId])

  const { data: products = [] } = useProductsByIds(ids)

  if (!products.length) return null

  return (
    <div className="mt-8">
      <ProductSection title="Recently Viewed" products={products} />
    </div>
  )
}
