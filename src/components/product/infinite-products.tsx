'use client'

import { useEffect, useMemo } from 'react'
import { useInView } from 'react-intersection-observer'
import { ProductCard } from '@/components/product/product-card'
import { Loader2 } from 'lucide-react'
import { useInfiniteProducts } from '@/hooks/use-infinite-products'

interface Props {
  initialProducts: any[]
  searchParams: Record<string, any>
}

export default function InfiniteProducts({
  initialProducts,
  searchParams,
}: Props) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteProducts(initialProducts, searchParams)

  const products = useMemo(() => {
    const seen = new Set<string>()
    const list: any[] = []
    for (const page of data?.pages || []) {
      for (const product of page.products || []) {
        if (seen.has(product.id)) continue
        seen.add(product.id)
        list.push(product)
      }
    }
    return list
  }, [data?.pages])

  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: false,
  })

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {hasNextPage && (
        <div ref={ref} className="h-24 flex items-center justify-center">
          {isFetchingNextPage && (
            <Loader2 className="h-10 w-10 text-purple-600 animate-spin" />
          )}
        </div>
      )}
    </>
  )
}
