'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Heart, ShoppingBag, Truck, RotateCcw, Shield, ChevronDown, ChevronUp, RectangleGoggles, Loader2 } from 'lucide-react'
import { Product, ProductVariant } from '@/types'
import { useCartStore } from '@/store/cart-store'
import { useWishlistStore } from '@/store/wishlist-store'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StarRating } from '@/components/ui/star-rating'
import { createClient } from '@/lib/supabase/client'
import { formatPrice, calculateDiscount } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { isVirtualTryOnEnabled } from '@/lib/virtual-try-on'
import type { SizeGuide } from '@/lib/size-guides'
import { SizeGuideList } from '@/components/size-guide/size-guide-section'
import toast from 'react-hot-toast'
import { trackAddToCart } from '@/lib/meta-pixel'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProductCategoryDisplay } from '@/lib/categories'

interface ProductInfoProps {
  product: Product
  sizeOrder?: string[]
  sizeGuides?: SizeGuide[]
}

export function ProductInfo({ product, sizeOrder = [], sizeGuides = [] }: ProductInfoProps) {
  const { addItem } = useCartStore()
  const { isInWishlist, toggleWishlist } = useWishlistStore()
  const { openCart } = useUIStore()
  const [quantity, setQuantity] = useState(1)
  const [expandedSection, setExpandedSection] = useState<string | null>('details')
  const router = useRouter()
  const searchParams = useSearchParams()
    const initialColor =
    searchParams.get('color')

  const initialSize =
    searchParams.get('size')

  const [selectedSize, setSelectedSize] =
    useState<string | null>(
      initialSize
    )

  const [selectedColor, setSelectedColor] =
    useState<string | null>(
      initialColor
    )

  const [mounted, setMounted] = useState(false)
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const updateUrl = (newColor: string | null, newSize: string | null) => {
    const params = new URLSearchParams(window.location.search)

    if (newColor) {
      params.set('color', newColor)
    } else {
      params.delete('color')
    }

    if (newSize) {
      params.set('size', newSize)
    } else {
      params.delete('size')
    }

    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const inWishlist = mounted && isInWishlist(product.id)
  const discount = calculateDiscount(product.price, product.compare_price || 0)
  const showVirtualTryOn = isVirtualTryOnEnabled(product)

  // Get unique sizes and colors from active variants
  const variants = product.variants?.filter((v) => v.is_active) || []
  const totalStock = variants.reduce(
    (sum, variant) => sum + variant.stock,
      0
    )
    console.log(
  variants.map(v => ({
    color: v.color,
    size: v.size,
    stock: v.stock
  }))
)
  const isProductOutOfStock = totalStock === 0
  const sizes = [...new Set(variants.map((v) => v.size))].sort((a, b) => {
    const aIndex = sizeOrder.indexOf(a)
    const bIndex = sizeOrder.indexOf(b)

    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
  const colors = [...new Set(variants.map((v) => v.color))]

  useEffect(() => {
    if (!selectedColor && colors.length > 0) {
      setSelectedColor(colors[0])
    }
    if (!selectedSize && sizes.length > 0) {
      setSelectedSize(sizes[0])
    }
  }, [colors, sizes])
  useEffect(() => {
    if (
      selectedColor &&
      selectedSize &&
      !searchParams.get('color') &&
      !searchParams.get('size')
    ) {
      updateUrl(
        selectedColor,
        selectedSize
      )
    }
  }, [selectedColor, selectedSize])

  useEffect(() => {
    if (!selectedColor || !selectedSize) return

    const variantExists = variants.some(
      (v) =>
        v.color === selectedColor &&
        v.size === selectedSize &&
        v.stock > 0
    )

    if (variantExists) return

    const fallbackVariant = variants.find(
      (v) =>
        v.color === selectedColor &&
        v.stock > 0
    )

    if (fallbackVariant) {
      setSelectedSize(fallbackVariant.size)

      updateUrl(
        fallbackVariant.color,
        fallbackVariant.size
      )
    }
  }, [selectedColor, selectedSize, variants])
  // Find matching variant
  const selectedVariant: ProductVariant | null =
    selectedSize && selectedColor
      ? variants.find((v) => v.size === selectedSize && v.color === selectedColor) || null
      : null

  const getVariantStock = (size: string, color: string) => {
    const v = variants.find((v) => v.size === size && v.color === color)
    return v?.stock || 0
  }

  const isSizeAvailable = (size: string) => {
    return variants.some(
      (v) => v.size === size && v.stock > 0
    )
  }

  const isColorAvailable = (color: string) => {
    return variants.some(
      (v) => v.color === color && v.stock > 0
    )
  }

  const currentStock = selectedVariant?.stock || 0
  const currentPrice = product.price + (selectedVariant?.price_modifier || 0)
  const isOutOfStock = !!selectedVariant && currentStock === 0

  const handleAddToCart = () => {
    if (isProductOutOfStock) {
      toast.error('Product is out of stock')
      return
    }
    if (!selectedSize) { toast.error('Please select a size'); return }
    if (!selectedColor) { toast.error('Please select a color'); return }
    if (!selectedVariant) { toast.error('This combination is unavailable'); return }
    if (isOutOfStock) { toast.error('This item is out of stock'); return }
    if (quantity > currentStock) { toast.error(`Only ${currentStock} left in stock`); return }

    addItem(product, selectedVariant, quantity)
    trackAddToCart({
      productId: product.id,
      productName: product.name,
      price: currentPrice,
      quantity,
    })
    toast.success(`${product.name} added to cart!`)
    openCart()
  }

  const handleWishlist = async () => {
    if (wishlistLoading) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      toast.error('Please sign in to save items')
      return
    }

    setWishlistLoading(true)
    try {
      toggleWishlist(product.id)

      if (!inWishlist) {
        await supabase.from('wishlist').upsert({ user_id: user.id, product_id: product.id })
        toast.success('Added to wishlist!')
      } else {
        await supabase.from('wishlist').delete().eq('user_id', user.id).eq('product_id', product.id)
        toast.success('Removed from wishlist')
      }
    } catch {
      toggleWishlist(product.id)
      toast.error('Failed to update wishlist')
    } finally {
      setWishlistLoading(false)
    }
  }

  const categoryDisplay = getProductCategoryDisplay({
    primary_category_label: product.primary_category_label,
    primary_category_slug: product.primary_category_slug,
    categories: product.categories as Parameters<typeof getProductCategoryDisplay>[0]['categories'],
  })

  return (
    <div className="space-y-6">
      {/* Category & Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {categoryDisplay?.slug ? (
          <Link
            href={`/products?category=${categoryDisplay.slug}`}
            className="text-sm text-purple-600 hover:underline"
          >
            {categoryDisplay.label}
          </Link>
        ) : null}
        {product.is_new_arrival && <Badge variant="new">New</Badge>}
        {discount > 0 && <Badge variant="sale">-{discount}% OFF</Badge>}
        {product.is_trending && <Badge variant="trending">Trending</Badge>}
      </div>

      {/* Product name */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {product.name}
        </h1>

        {isProductOutOfStock && (
          <div className="mt-2">
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Rating */}
      {product.review_count > 0 && (
        <div className="flex items-center gap-3">
          <StarRating rating={product.average_rating} size="md" />
          <span className="text-sm text-gray-600">
            {product.average_rating.toFixed(1)} ({product.review_count} reviews)
          </span>
        </div>
      )}

      {/* Price */}
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold text-gray-900">{formatPrice(currentPrice)}</span>
        {product.compare_price && product.compare_price > product.price && (
          <span className="text-xl text-gray-400 line-through">{formatPrice(product.compare_price)}</span>
        )}
        {discount > 0 && (
          <span className="text-sm font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            Save {formatPrice(product.compare_price! - product.price)}
          </span>
        )}
      </div>
      {isProductOutOfStock ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">
            This product is currently out of stock.
          </p>
        </div>
      ) : currentStock > 0 && currentStock <= 5 ? (
        // <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
        //   <p className="text-sm font-medium text-orange-700">
        //     Only {currentStock} left in stock.
        //   </p>
        // </div> 
        ''
      ) : null}
      {/* Short description */}
      {product.short_description && (
        <p className="text-gray-600 leading-relaxed">{product.short_description}</p>
      )}

      {/* Color selection */}
      {colors.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-900">Color:</span>
            {selectedColor && <span className="text-sm text-gray-600">{selectedColor}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => {
              const available = isColorAvailable(color)
              return (
                <button
                  key={color}
                  onClick={() => {
                    setSelectedColor(color)

                    const matchingVariant = variants.find(
                      (v) =>
                        v.color === color &&
                        v.stock > 0
                    )

                    if (matchingVariant) {
                      setSelectedSize(matchingVariant.size)

                      updateUrl(
                        matchingVariant.color,
                        matchingVariant.size
                      )
                    }
                  }}
                  disabled={!available || isProductOutOfStock}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all',
                    selectedColor === color
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : available
                        ? 'border-gray-300 text-gray-700 hover:border-purple-400'
                        : 'border-gray-200 text-gray-300 cursor-not-allowed opacity-60'
                  )}
                >
                  {color}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Size selection */}
      {sizes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Size:</span>
              {selectedSize && <span className="text-sm text-gray-600">{selectedSize}</span>}
            </div>
            {sizeGuides.length > 0 ? (
              <button
                type="button"
                onClick={() => setSizeGuideOpen((value) => !value)}
                className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline"
              >
                Size Guide
                {sizeGuideOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <Link href="/size-guide" className="text-xs text-purple-600 hover:underline">
                Size Guide
              </Link>
            )}
          </div>
          {sizeGuideOpen && sizeGuides.length > 0 && (
            <div className="mb-3">
              <SizeGuideList guides={sizeGuides} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => {
              const available = isSizeAvailable(size)
              const stock = selectedColor ? getVariantStock(size, selectedColor) : null
              return (
                <button
                  key={size}
                  onClick={() => {
                    setSelectedSize(size)

                    const matchingVariant =
                      variants.find(
                        (v) =>
                          v.size === size &&
                          v.stock > 0
                      )

                    if (matchingVariant) {
                      setSelectedColor(
                        matchingVariant.color
                      )

                      updateUrl(
                        matchingVariant.color,
                        size
                      )
                    }
                  }}
                  disabled={!available || isProductOutOfStock}
                  className={cn(
                    'h-10 min-w-[40px] px-3 text-sm font-medium rounded-lg border-2 transition-all relative',
                    selectedSize === size
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : available
                        ? 'border-gray-300 text-gray-700 hover:border-purple-400'
                        : 'border-gray-200 text-gray-300 cursor-not-allowed opacity-60'
                  )}
                >
                  {size}
                  {!available && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="absolute h-px w-full bg-gray-300 rotate-45" />
                    </span>
                  )}
                  {stock !== null && stock > 0 && stock <= 5 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center">
                      {stock}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Stock warning */}
      {/* {selectedVariant && currentStock > 0 && currentStock <= 5 && (
        <p className="text-sm text-orange-600 font-medium">
          Only {currentStock} left in stock — order soon!
        </p>
      )} */}

      {/* Quantity */}
      {!isProductOutOfStock && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">Quantity:</span>
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="px-3 py-2 hover:bg-gray-100 transition-colors"
            >
              -
            </button>
            <span className="w-10 text-center text-sm font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity(Math.min(currentStock || 10, quantity + 1))}
              className="px-3 py-2 hover:bg-gray-100 transition-colors"
              disabled={selectedVariant ? quantity >= currentStock : false}
            >
              +
            </button>
          </div>
          {selectedVariant && (
            <span className="text-sm text-gray-500">{currentStock} available</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        {showVirtualTryOn && (
        <Button
        disabled={isProductOutOfStock}
          onClick={() => {

            // REQUIRE COLOR
            if (!selectedColor) {
              toast.error(
                'Please select a color'
              )
              return
            }

            // FIND SELECTED COLOR IMAGE
            const selectedColorVariant =
              variants.find(
                (v) =>
                  v.color === selectedColor
              )

            const image =
              selectedColorVariant?.image_url ||
              selectedVariant?.image_url ||
              product.images?.find(
                (img: any) =>
                  img.color === selectedColor
              )?.url ||
              product.images?.[0]?.url

            if (!image) {
              toast.error(
                'No product image found'
              )
              return
            }

            router.push(
              `/try-on?product=${encodeURIComponent(
                image
              )}&productId=${product.id}&name=${encodeURIComponent(
                product.name
              )}&color=${encodeURIComponent(
                selectedColor
              )}`
            )
          }}
          className="w-full sm:flex-1 cursor-pointer"
          size="lg"
          variant="brand"
        >
          <RectangleGoggles className="h-5 w-5" />
          Virtual Try On
        </Button>
        )}

        <Button
          onClick={handleAddToCart}
          className=" w-full sm:flex-1 cursor-pointer"
          size="lg"
          variant="brand"
          disabled={isProductOutOfStock}
        >
          <ShoppingBag className="h-5 w-5" />
          {isProductOutOfStock
            ? 'Out of Stock'
            : 'Add to Cart'}
        </Button>
        <button
          onClick={handleWishlist}
          disabled={wishlistLoading}
          className={cn(
            'h-12 w-12 rounded-xl border-2 flex items-center justify-center transition-all disabled:opacity-70 cursor-pointer',
            inWishlist
              ? 'border-red-500 bg-red-50 text-red-500'
              : 'border-gray-300 text-gray-600 hover:border-red-400 hover:text-red-500'
          )}
          aria-label="Add to wishlist"
        >
          {wishlistLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Heart className={cn('h-5 w-5', inWishlist && 'fill-current')} />
          )}
        </button>
      </div>

      {/* Delivery estimate */}
      <div className="grid grid-cols-3 gap-3 py-4 border-t border-b border-gray-100">
        {[
          { icon: Truck, text: 'Free shipping' },
          { icon: RotateCcw, text: '7-days return' },
          { icon: Shield, text: 'Secure checkout' },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex flex-col items-center gap-1 text-center">
            <Icon className="h-5 w-5 text-purple-600" />
            <span className="text-xs text-gray-600">{text}</span>
          </div>
        ))}
      </div>

      {/* Expandable sections */}
      {[
        {
          id: 'details',
          title: 'Product Details',
          content: product.description || 'No description available.',
        },
      ].map((section) => (
        <div key={section.id} className="border-b border-gray-100 pb-4">
          <button
            onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
            className="flex items-center justify-between w-full py-1 text-sm font-semibold text-gray-900"
          >
            {section.title}
            {expandedSection === section.id ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
          {expandedSection === section.id && (
            <div className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
              {section.content}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
