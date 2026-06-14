'use client'

import {
  useEffect,
  useRef,
  useState,
} from 'react'

import { useInView }
from 'react-intersection-observer'

import { ProductCard }
from '@/components/product/product-card'
import { Loader2 } from 'lucide-react'

interface Props {
  initialProducts: any[]
  searchParams: Record<string, any>
}

export default function InfiniteProducts({
  initialProducts,
  searchParams,
}: Props) {

  const [products, setProducts] =
    useState(initialProducts)

  const [page, setPage] =
    useState(2)

  const [loading, setLoading] =
    useState(false)

    const [hasMore, setHasMore] =
    useState(
        initialProducts.length >= 16
    )

  const { ref, inView } =
    useInView({
      threshold: 0,
      triggerOnce: false,
    })
    const fetchingRef =
  useRef(false)
  ////////////////////////////////////////////////////
  // LOAD MORE
  ////////////////////////////////////////////////////
    const loadMore =
    async () => {

      if (
        fetchingRef.current ||
        !hasMore
        ) {
        return
        }
      const nextPage = page
      setLoading(true)

      try {

        const params =
          new URLSearchParams()

        params.set(
          'page',
          String(nextPage)
        )

        Object.entries(
          searchParams
        ).forEach(
          ([key, value]) => {

            if (
              value === undefined ||
              value === null
            ) {
              return
            }

            if (
              Array.isArray(
                value
              )
            ) {
              value.forEach(
                (v) =>
                  params.append(
                    key,
                    String(v)
                  )
              )
            } else {
              params.set(
                key,
                String(value)
              )
            }
          }
        )
        fetchingRef.current = true
        setLoading(true)
        const res =
          await fetch(
            `/api/products?${params.toString()}`
          )

        const data =
          await res.json()

        ////////////////////////////////////////////////////
        // REMOVE DUPLICATES
        ////////////////////////////////////////////////////

        setProducts(
          (prev) => {

            const existing =
              new Set(
                prev.map(
                  (p) => p.id
                )
              )

            const unique =
              data.products.filter(
                (p: any) =>
                  !existing.has(
                    p.id
                  )
              )

            return [
              ...prev,
              ...unique,
            ]
          }
        )

        setHasMore(
          data.hasMore
        )

        setPage(
          nextPage + 1
        )

      } catch (err) {

        console.error(err)

      } finally {

        fetchingRef.current = false

        setLoading(false)
        }
    }

  ////////////////////////////////////////////////////
  // OBSERVER
  ////////////////////////////////////////////////////

    useEffect(() => {
        if (
            inView &&
            hasMore
        ) {
            loadMore()
        }
    }, [inView, hasMore, page])

    useEffect(() => {
        setProducts(
            initialProducts
        )
        setPage(2)
        setHasMore(
            initialProducts.length >= 16
        )
    }, [initialProducts])

  return (
    <>
      <div
        className="
          grid
          grid-cols-2
          sm:grid-cols-3
          lg:grid-cols-4
          gap-4
        "
      >
        {products.map(
          (product) => (
            <ProductCard
              key={product.id}
              product={product}
            />
          )
        )}
      </div>

      {hasMore && (
        <div
          ref={ref}
          className="
            h-24
            flex
            items-center
            justify-center
          "
        >
          {loading &&
            <Loader2 className="h-10 w-10 text-purple-600 animate-spin" />}
        </div>
      )}
    </>
  )
}