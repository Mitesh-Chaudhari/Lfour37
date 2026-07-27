'use client'

import { useEffect, useRef } from 'react'
import { useCartStore } from '@/store/cart-store'
import {
  trackGaBeginCheckout,
  trackGaPurchase,
  trackGaSearch,
  trackGaViewItem,
} from '@/lib/google-analytics'

interface ViewItemTrackerProps {
  productId: string
  productName: string
  price: number
  category?: string
}

export function GaViewItemTracker({
  productId,
  productName,
  price,
  category,
}: ViewItemTrackerProps) {
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current) return
    tracked.current = true

    trackGaViewItem({
      productId,
      productName,
      price,
      category,
    })
  }, [productId, productName, price, category])

  return null
}

export function GaBeginCheckoutTracker() {
  const tracked = useRef(false)
  const items = useCartStore((state) => state.items)
  const getTotal = useCartStore((state) => state.getTotal)

  useEffect(() => {
    if (tracked.current || items.length === 0) return
    tracked.current = true

    trackGaBeginCheckout({
      value: getTotal(),
      items: items.map((item) => ({
        productId: item.product_id,
        quantity: item.quantity,
        price: (item.product?.price ?? 0) + (item.variant?.price_modifier ?? 0),
        productName: item.product?.name,
      })),
    })
  }, [items, getTotal])

  return null
}

interface PurchaseTrackerProps {
  orderId: string
  value: number
  items: Array<{
    product_id?: string | null
    product_name?: string | null
    quantity: number
    unit_price?: number | null
  }>
}

export function GaPurchaseTracker({ orderId, value, items }: PurchaseTrackerProps) {
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current || !orderId) return
    tracked.current = true

    const gaItems = items
      .filter((item): item is typeof item & { product_id: string } => Boolean(item.product_id))
      .map((item) => ({
        productId: item.product_id,
        quantity: item.quantity,
        ...(item.unit_price != null ? { price: item.unit_price } : {}),
        ...(item.product_name ? { productName: item.product_name } : {}),
      }))

    trackGaPurchase({
      orderId,
      value,
      items: gaItems,
    })
  }, [orderId, value, items])

  return null
}

interface SearchTrackerProps {
  searchTerm: string
}

export function GaSearchTracker({ searchTerm }: SearchTrackerProps) {
  const lastTrackedTerm = useRef<string | null>(null)

  useEffect(() => {
    const term = searchTerm.trim()
    if (!term || term === lastTrackedTerm.current) return
    lastTrackedTerm.current = term

    trackGaSearch(term)
  }, [searchTerm])

  return null
}
