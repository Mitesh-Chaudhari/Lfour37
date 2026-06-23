'use client'

import Link from 'next/link'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ShoppingBag, Plus, Minus, Trash2, Bookmark, ArrowRight } from 'lucide-react'
import { useCartStore } from '@/store/cart-store'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import { persistAuthRedirect } from '@/lib/auth-redirect'
import type { Metadata } from 'next'

export default function CartPage() {
  const {
    items,
    savedForLater,
    removeItem,
    updateQuantity,
    saveForLater,
    moveToCart,
    removeSavedItem,
    getSubtotal,
    getTotal,
    discountAmount,
  } = useCartStore()

  const subtotal = getSubtotal()
  const total = getTotal()

  if (items.length === 0 && savedForLater.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <ShoppingBag className="h-24 w-24 text-gray-200 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Your cart is empty</h1>
        <p className="text-gray-500 mb-8">Add some items and come back!</p>
        <Button variant="brand" size="lg" asChild>
          <Link href="/products">Start Shopping</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const itemPrice = item.product.price + item.variant.price_modifier
            return (
              <div key={item.id} className="flex gap-4 bg-white rounded-xl border border-gray-200 p-4">
                <div className="relative h-28 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {item.variant.image_url ? (
                    <OptimizedImage
                      src={item.variant.image_url}
                      alt={item.product.name}
                      fill
                      variant="cart"
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gray-200" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link
                        href={`/products/${item.product.slug}`}
                        className="font-semibold text-gray-900 hover:text-purple-600 transition-colors"
                      >
                        {item.product.name}
                      </Link>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Size: {item.variant.size} / Color: {item.variant.color}
                      </p>
                      {item.variant.stock <= 5 && item.variant.stock > 0 && (
                        <p className="text-xs text-orange-600 mt-1">Only {item.variant.stock} left!</p>
                      )}
                    </div>
                    <p className="text-lg font-bold text-gray-900 ml-4">
                      {formatPrice(itemPrice * item.quantity)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      {/* Quantity */}
                      <div className="flex items-center gap-1 rounded-lg border border-gray-300">
                        <button
                          onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                          className="p-2 hover:bg-gray-100 rounded-l-lg transition-colors"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
                          className="p-2 hover:bg-gray-100 rounded-r-lg transition-colors"
                          disabled={item.quantity >= item.variant.stock}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => saveForLater(item.variant_id)}
                        className="flex items-center gap-1 text-sm text-gray-600 hover:text-purple-600 transition-colors"
                      >
                        <Bookmark className="h-4 w-4" /> Save for later
                      </button>
                      <button
                        onClick={() => removeItem(item.variant_id)}
                        className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Saved for later */}
          {savedForLater.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Saved for Later ({savedForLater.length})
              </h2>
              {savedForLater.map((item) => (
                <div key={item.id} className="flex gap-4 bg-white rounded-xl border border-gray-200 p-4 mb-3">
                  <div className="relative h-20 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {item.variant.image_url ? (
                      <OptimizedImage
                        src={item.variant.image_url}
                        alt={item.product.name}
                        fill
                        variant="cartDrawer"
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gray-200" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.product.name}</p>
                    <p className="text-sm text-gray-500">{item.variant.size} / {item.variant.color}</p>
                    <p className="text-sm font-bold mt-1">{formatPrice(item.product.price)}</p>
                    <div className="flex gap-3 mt-2">
                      <button onClick={() => moveToCart(item.variant_id)} className="text-sm text-purple-600 hover:underline">
                        Move to Cart
                      </button>
                      <button onClick={() => removeSavedItem(item.variant_id)} className="text-sm text-red-500 hover:underline">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Order Summary</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatPrice(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium text-green-600">Free</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            <Button variant="brand" size="lg" className="w-full mt-6" asChild>
              <Link
                href="/checkout"
                className="flex items-center justify-center gap-2"
                onClick={() => persistAuthRedirect('/checkout')}
              >
                Proceed to Checkout <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>

            <Link
              href="/products"
              className="block text-center text-sm text-gray-600 hover:text-purple-600 transition-colors mt-4"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
