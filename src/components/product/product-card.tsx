'use client'

import Link from 'next/link'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { DEFAULT_PRODUCT_IMAGE } from '@/lib/images'
import { useState, useEffect, type MouseEvent } from 'react'
import { Heart, ShoppingBag, Star, Loader2 } from 'lucide-react'
import { Product } from '@/types'
import { useWishlistStore } from '@/store/wishlist-store'
import { Badge } from '@/components/ui/badge'
import { formatPrice, calculateDiscount } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useNavigationStore } from '@/store/navigation-store'

interface ProductCardProps {
  product: Product
  className?: string
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { isInWishlist, toggleWishlist } = useWishlistStore()
  const [mounted, setMounted] = useState(false)
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [isNavigating, setIsNavigating] = useState(false)
  const startNavigation = useNavigationStore((state) => state.startNavigation)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setIsNavigating(false) }, [product.slug])

  const imageUrls =
    product.images?.map((image) => image.url).filter((url): url is string => Boolean(url)) ??
    []
  const mobileSlideImages = imageUrls.slice(0, 2)
  const primaryImage = imageUrls[0]
  const secondaryImage = imageUrls[1]
  const hasMultipleImages = mobileSlideImages.length > 1

  const imageTransitionClass =
    'transition-opacity duration-700 ease-in-out'

  useEffect(() => {
    if (mobileSlideImages.length <= 1) return

    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % mobileSlideImages.length)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [mobileSlideImages.length])

  const inWishlist = mounted && isInWishlist(product.id)
  const totalStock = product.variants?.reduce((sum, v) => sum + v.stock, 0) ?? 0
  const isOutOfStock = totalStock === 0
  const discount =
    product.compare_price &&
    product.compare_price > product.price
      ? calculateDiscount(product.price, product.compare_price)
      : 0

  const handleWishlistToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (wishlistLoading) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      toast.error('Please sign in to save items to your wishlist')
      return
    }

    setWishlistLoading(true)
    try {
      toggleWishlist(product.id)

      if (!inWishlist) {
        await supabase.from('wishlist').upsert({ user_id: user.id, product_id: product.id })
        toast.success('Added to wishlist')
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

  const handleCardClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isNavigating) {
      event.preventDefault()
      return
    }

    setIsNavigating(true)
    startNavigation()
  }

  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn('group block', className, isNavigating && 'pointer-events-none')}
      onClick={handleCardClick}
      aria-busy={isNavigating}
    >
      <div className="relative overflow-hidden rounded-xl bg-gray-100 aspect-[3/4]">
        {primaryImage ? (
          <>
            {/* Mobile: crossfade between first two images */}
            <div
              className={cn(
                'absolute inset-0',
                hasMultipleImages ? 'md:hidden' : ''
              )}
            >
              {hasMultipleImages ? (
                mobileSlideImages.map((url, index) => (
                  <div
                    key={url}
                    className={cn(
                      'absolute inset-0',
                      imageTransitionClass,
                      index === slideIndex ? 'opacity-100 z-[1]' : 'opacity-0 z-0'
                    )}
                    aria-hidden={index !== slideIndex}
                  >
                    <OptimizedImage
                      src={url}
                      alt={product.name}
                      fill
                      variant="card"
                      priority
                      loading="eager"
                      fadeOnLoad={false}
                      placeholderImage={DEFAULT_PRODUCT_IMAGE}
                      className="object-cover"
                    />
                  </div>
                ))
              ) : (
                <OptimizedImage
                  src={primaryImage}
                  alt={product.name}
                  fill
                  variant="card"
                  priority
                  loading="eager"
                  placeholderImage={DEFAULT_PRODUCT_IMAGE}
                  className={cn(
                    'object-cover',
                    !hasMultipleImages &&
                      'transition-transform duration-700 ease-in-out md:group-hover:scale-105'
                  )}
                />
              )}
              {hasMultipleImages && (
                <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
                  {mobileSlideImages.map((url, index) => (
                    <span
                      key={url}
                      className={cn(
                        'h-1 rounded-full bg-white transition-all duration-500 ease-in-out',
                        index === slideIndex ? 'w-3' : 'w-1 bg-white/50'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Desktop: smooth crossfade on hover */}
            {hasMultipleImages && (
              <div className="absolute inset-0 hidden md:block">
                <div
                  className={cn(
                    'absolute inset-0 z-[1]',
                    imageTransitionClass,
                    'group-hover:opacity-0'
                  )}
                >
                  <OptimizedImage
                    src={primaryImage}
                    alt={product.name}
                    fill
                    variant="card"
                    fadeOnLoad={false}
                    placeholderImage={DEFAULT_PRODUCT_IMAGE}
                    className="object-cover"
                  />
                </div>
                {secondaryImage && (
                  <div
                    className={cn(
                      'absolute inset-0 z-[2]',
                      imageTransitionClass,
                      'opacity-0 group-hover:opacity-100'
                    )}
                  >
                    <OptimizedImage
                      src={secondaryImage}
                      alt={product.name}
                      fill
                      variant="card"
                      fadeOnLoad={false}
                      placeholderImage={DEFAULT_PRODUCT_IMAGE}
                      className="object-cover"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-gray-300" />
          </div>
        )}

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 z-30 bg-white/60 flex items-center justify-center">
            <span className="bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              Out of Stock
            </span>
          </div>
        )}

        {/* Badges — z-20 keeps tags above OptimizedImage layers (z-[1]) */}
        <div className="pointer-events-none absolute top-2 left-2 z-20 flex flex-col gap-1">
          {product.is_best_seller && <Badge variant="bestseller">Best Seller</Badge>}
          {product.is_featured && <Badge variant="default">Featured</Badge>}
          {product.is_new_arrival && <Badge variant="new">New</Badge>}
          {discount > 0 && <Badge variant="sale">-{discount}%</Badge>}
          {product.is_trending && <Badge variant="trending">Trending</Badge>}
        </div>

        {/* Wishlist button */}
        <button
          onClick={handleWishlistToggle}
          disabled={wishlistLoading}
          className={cn(
            'absolute top-2 right-2 z-20 h-8 w-8 rounded-full bg-white shadow flex items-center justify-center transition-all duration-200',
            'opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0',
            inWishlist && 'opacity-100 translate-y-0',
            wishlistLoading && 'opacity-100 translate-y-0'
          )}
          aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          {wishlistLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
          ) : (
            <Heart
              className={cn('h-4 w-4', inWishlist ? 'fill-red-500 text-red-500' : 'text-gray-600')}
            />
          )}
        </button>

        {/* Quick view on hover (bottom) */}
        <div className={cn(
          'absolute bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm py-2 px-3 text-center',
          'opacity-0 translate-y-full group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300'
        )}>
          <span className="text-xs font-semibold text-gray-900">Quick View</span>
        </div>
      </div>

      {/* Product info */}
      <div className="mt-3 space-y-1">
        <h3
          className={cn(
            'text-sm font-medium line-clamp-1 transition-colors',
            isNavigating ? 'text-purple-600' : 'text-gray-900 group-hover:text-purple-600'
          )}
        >
          {product.name}
        </h3>

        {/* Rating */}
        {product.review_count > 0 && (
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-xs text-gray-500">
              {product.average_rating.toFixed(1)} ({product.review_count})
            </span>
          </div>
        )}

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{formatPrice(product.price)}</span>
          {product.compare_price && product.compare_price > product.price && (
            <span className="text-xs text-gray-400 line-through">{formatPrice(product.compare_price)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
