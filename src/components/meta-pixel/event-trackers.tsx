'use client'

import { useEffect, useRef } from 'react'
import { useCartStore } from '@/store/cart-store'
import {
  META_CURRENCY,
  trackInitiateCheckout,
  trackMetaEvent,
  trackPurchase,
} from '@/lib/meta-pixel'

interface ViewContentTrackerProps {
  productId: string
  productName: string
  price: number
  category?: string
}

export function MetaViewContentTracker({
  productId,
  productName,
  price,
  category,
}: ViewContentTrackerProps) {
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current) return
    tracked.current = true

    trackMetaEvent('ViewContent', {
      content_ids: [productId],
      content_name: productName,
      content_type: 'product',
      value: price,
      currency: META_CURRENCY,
      ...(category ? { content_category: category } : {}),
    })
  }, [productId, productName, price, category])

  return null
}

export function MetaInitiateCheckoutTracker() {
  const tracked = useRef(false)
  const items = useCartStore((state) => state.items)
  const getTotal = useCartStore((state) => state.getTotal)

  useEffect(() => {
    if (tracked.current || items.length === 0) return
    tracked.current = true

    trackInitiateCheckout({
      value: getTotal(),
      numItems: items.reduce((sum, item) => sum + item.quantity, 0),
      contentIds: items.map((item) => item.product_id),
    })
  }, [items, getTotal])

  return null
}

interface PurchaseTrackerProps {
  orderId: string
  value: number
  items: Array<{
    product_id?: string | null
    quantity: number
  }>
}

export function MetaPurchaseTracker({ orderId, value, items }: PurchaseTrackerProps) {
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current || !orderId) return
    tracked.current = true

    const contentIds = items
      .map((item) => item.product_id)
      .filter((id): id is string => Boolean(id))

    trackPurchase({
      orderId,
      value,
      numItems: items.reduce((sum, item) => sum + item.quantity, 0),
      contentIds,
    })
  }, [orderId, value, items])

  return null
}

interface SearchTrackerProps {
  searchTerm: string
}

export function MetaSearchTracker({ searchTerm }: SearchTrackerProps) {
  const lastTrackedTerm = useRef<string | null>(null)

  useEffect(() => {
    const term = searchTerm.trim()
    if (!term || term === lastTrackedTerm.current) return
    lastTrackedTerm.current = term

    trackMetaEvent('Search', {
      search_string: term,
    })
  }, [searchTerm])

  return null
}
