'use client'

import { useState } from 'react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import Link from 'next/link'
import { Trash2, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/store/cart-store'
import { useWishlistStore } from '@/store/wishlist-store'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { trackAddToCart } from '@/lib/meta-pixel'

interface WishlistProduct {
  id: string
  name: string
  slug: string
  price: number
  compare_price: number | null
  images: { url: string; alt?: string }[]
  status: string
  variants: { id: string; size: string; color: string; stock: number; is_active: boolean }[]
}

interface WishlistItemData {
  id: string
  created_at: string
  product: WishlistProduct
}

export function WishlistClient({ items: initialItems, userId }: { items: WishlistItemData[]; userId: string }) {
  const [items, setItems] = useState(initialItems)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const { removeFromWishlist } = useWishlistStore()
  const { addItem } = useCartStore()
  const supabase = createClient()

  const removeItem = async (wishlistId: string, productId: string) => {
    setRemovingId(wishlistId)
    try {
      const { error } = await supabase
        .from('wishlist')
        .delete()
        .eq('id', wishlistId)
        .eq('user_id', userId)

      if (!error) {
        setItems(items.filter((i) => i.id !== wishlistId))
        removeFromWishlist(productId)
        toast.success('Removed from wishlist')
      } else {
        toast.error('Failed to remove item')
      }
    } finally {
      setRemovingId(null)
    }
  }

  const moveToCart = async (item: WishlistItemData) => {
    const { product } = item
    if (!product) return

    const availableVariant = product.variants?.find((v) => v.is_active && v.stock > 0)
    if (!availableVariant) {
      toast.error('No variants available in stock')
      return
    }

    setAddingId(item.id)
    try {
      addItem(product as any, availableVariant as any, 1)
      trackAddToCart({
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
      })
      toast.success('Added to cart!')
    } finally {
      setAddingId(null)
    }
  }

  const isOutOfStock = (product: WishlistProduct) =>
    !product.variants?.some((v) => v.is_active && v.stock > 0)

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const { product } = item
        if (!product) return null
        const image = product.images?.[0]
        const outOfStock = isOutOfStock(product)
        const isRemoving = removingId === item.id
        const isAdding = addingId === item.id
        const isBusy = isRemoving || isAdding
        const discount = product.compare_price
          ? Math.round(((product.compare_price - product.price) / product.compare_price) * 100)
          : 0

        return (
          <div key={item.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden group relative">
            {isBusy && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
              </div>
            )}
            <div className="relative aspect-[3/4] bg-gray-50">
              <Link href={`/products/${product.slug}`}>
                {image ? (
                  <OptimizedImage
                    src={image.url}
                    alt={image.alt || product.name}
                    fill
                    variant="card"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200" />
                )}
              </Link>
              {outOfStock && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <Badge variant="secondary">Out of Stock</Badge>
                </div>
              )}
              {discount > 0 && (
                <div className="absolute top-2 left-2">
                  <Badge variant="sale">-{discount}%</Badge>
                </div>
              )}
              <button
                onClick={() => removeItem(item.id, product.id)}
                disabled={isBusy}
                className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-sm text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3">
              <Link href={`/products/${product.slug}`}>
                <p className="font-medium text-gray-900 text-sm line-clamp-2 hover:text-purple-600 transition-colors">
                  {product.name}
                </p>
              </Link>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-semibold text-gray-900">{formatPrice(product.price)}</span>
                {product.compare_price && (
                  <span className="text-xs text-gray-400 line-through">{formatPrice(product.compare_price)}</span>
                )}
              </div>
              <Button
                onClick={() => moveToCart(item)}
                disabled={outOfStock || isBusy}
                loading={isAdding}
                className="mt-3 w-full"
                size="sm"
              >
                <ShoppingBag className="h-4 w-4" />
                {outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
