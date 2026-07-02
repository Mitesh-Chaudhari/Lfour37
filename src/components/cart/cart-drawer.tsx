'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { X, ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react'
import { useCartStore } from '@/store/cart-store'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import { persistAuthRedirect } from '@/lib/auth-redirect'
import toast from 'react-hot-toast'

const MAX_STOCK_TOAST = 'Maximum stock reached for this item'

export function CartDrawer() {
  const { isCartOpen, closeCart } = useUIStore()
  const { items, removeItem, updateQuantity, incrementQuantity, getSubtotal, getItemCount, savedForLater, moveToCart, removeSavedItem } =
    useCartStore()

  const handleIncrementQuantity = (variantId: string) => {
    if (!incrementQuantity(variantId)) {
      toast.error(MAX_STOCK_TOAST)
    }
  }

  useEffect(() => {
    if (isCartOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isCartOpen])

  if (!isCartOpen) return null

  const subtotal = getSubtotal()
  const itemCount = getItemCount()
  const FREE_SHIPPING_THRESHOLD = 75

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={closeCart}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">Shopping Cart</h2>
            {itemCount > 0 && (
              <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-600">
                {itemCount}
              </span>
            )}
          </div>
          <button onClick={closeCart} className="rounded-lg p-2 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Free shipping progress */}
        {subtotal < FREE_SHIPPING_THRESHOLD && items.length > 0 && (
          <div className="bg-purple-50 px-6 py-3">
            <p className="text-xs text-purple-700">
              Add <strong>{formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)}</strong> more for free shipping!
            </p>
            <div className="mt-1.5 h-1.5 rounded-full bg-purple-100">
              <div
                className="h-1.5 rounded-full bg-purple-600 transition-all duration-500"
                style={{ width: `${Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <ShoppingBag className="h-16 w-16 text-gray-200" />
              <div>
                <p className="font-medium text-gray-900">Your cart is empty</p>
                <p className="text-sm text-gray-500 mt-1">Add items to get started</p>
              </div>
              <Button onClick={closeCart} asChild>
                <Link href="/products">Start Shopping</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const itemPrice = item.product.price + item.variant.price_modifier
                console.log("item.variant",item.variant);
                console.log("product.images",item.product.images);
                
                return (
                  <div key={item.id} className="flex gap-3 py-3 border-b last:border-0">
                    {/* Image */}
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
                        <div className="flex h-full items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <Link
                          href={`/products/${item.product.slug}`}
                          className="text-sm font-medium text-gray-900 hover:text-purple-600 line-clamp-1"
                          onClick={closeCart}
                        >
                          {item.product.name}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.variant.size} / {item.variant.color}
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        {/* Quantity */}
                        <div className="flex items-center gap-1 rounded-lg border">
                          <button
                            onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                            className="p-1.5 hover:bg-gray-100 rounded-l-lg transition-colors"
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                          <button
                            onClick={() => handleIncrementQuantity(item.variant_id)}
                            className="p-1.5 hover:bg-gray-100 rounded-r-lg transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">
                            {formatPrice(itemPrice * item.quantity)}
                          </p>
                          <button
                            onClick={() => removeItem(item.variant_id)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Saved for later */}
              {savedForLater.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Saved for Later ({savedForLater.length})</h3>
                  {savedForLater.map((item) => (
                    <div key={item.id} className="flex gap-3 py-2 border-b last:border-0">
                      <div className="relative h-14 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {item.product.images[0] && (
                          <OptimizedImage
                            src={item.product.images[0].url}
                            alt={item.product.name}
                            fill
                            variant="thumbnail"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-gray-900 line-clamp-1">{item.product.name}</p>
                        <p className="text-xs text-gray-500">{item.variant.size} / {item.variant.color}</p>
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => moveToCart(item.variant_id)} className="text-xs text-purple-600 hover:underline">Move to Cart</button>
                          <button onClick={() => removeSavedItem(item.variant_id)} className="text-xs text-red-500 hover:underline">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t px-6 py-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Subtotal (Inclusive 5% Tax)</span>
              <span className="text-lg font-bold text-gray-900">{formatPrice(subtotal)}</span>
            </div>
            <p className="text-xs text-gray-400">Taxes and shipping calculated at checkout</p>
            <Button
              className="w-full"
              size="lg"
              variant="brand"
              asChild
              onClick={closeCart}
            >
              <Link
                href="/checkout"
                onClick={() => persistAuthRedirect('/checkout')}
              >
                Proceed to Checkout
              </Link>
            </Button>
            <Link
              href="/cart"
              className="block text-center text-sm text-gray-600 hover:text-purple-600 transition-colors"
              onClick={closeCart}
            >
              View Full Cart
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
