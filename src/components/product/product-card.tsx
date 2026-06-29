'use client'

import Link from 'next/link'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { useState, useEffect } from 'react'
import { Heart, ShoppingBag, Star, Loader2 } from 'lucide-react'
import { Product } from '@/types'
import { useWishlistStore } from '@/store/wishlist-store'
import { Badge } from '@/components/ui/badge'
import { formatPrice, calculateDiscount } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface ProductCardProps {
  product: Product
  className?: string
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { isInWishlist, toggleWishlist } = useWishlistStore()
  const [mounted, setMounted] = useState(false)
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const [showSecondary, setShowSecondary] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const imageUrls =
    product.images?.map((image) => image.url).filter((url): url is string => Boolean(url)) ??
    []
  const primaryImage = imageUrls[0]
  const secondaryImage = imageUrls[1]
  const hasMultipleImages = imageUrls.length > 1

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const updateViewport = () => setIsMobile(mediaQuery.matches)

    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  useEffect(() => {
    if (!isMobile || imageUrls.length <= 1) return

    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % imageUrls.length)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [isMobile, imageUrls.length])

  useEffect(() => {
    if (!isMobile) {
      setSlideIndex(0)
    }
  }, [isMobile])

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

  return (
    <Link href={`/products/${product.slug}`} className={cn('group block', className)}>
      <div
        className="relative overflow-hidden rounded-xl bg-gray-100 aspect-[3/4]"
        onMouseEnter={() => setShowSecondary(true)}
        onFocus={() => setShowSecondary(true)}
      >
        {primaryImage ? (
          isMobile && hasMultipleImages ? (
            <>
              {imageUrls.map((url, index) => (
                <OptimizedImage
                  key={url}
                  src={url}
                  alt={`${product.name} - image ${index + 1}`}
                  fill
                  variant="card"
                  priority={index === 0}
                  className={cn(
                    'object-cover transition-opacity duration-500',
                    index === slideIndex ? 'opacity-100' : 'opacity-0'
                  )}
                />
              ))}
              <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
                {imageUrls.map((url, index) => (
                  <span
                    key={url}
                    className={cn(
                      'h-1 rounded-full bg-white transition-all',
                      index === slideIndex ? 'w-3' : 'w-1 bg-white/50'
                    )}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <OptimizedImage
                src={primaryImage}
                alt={product.name}
                fill
                variant="card"
                className={cn(
                  'object-cover transition-all duration-500',
                  secondaryImage ? 'group-hover:opacity-0' : 'group-hover:scale-105'
                )}
              />
              {secondaryImage && showSecondary && (
                <OptimizedImage
                  key={secondaryImage}
                  src={secondaryImage}
                  alt={product.name}
                  fill
                  variant="card"
                  className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                />
              )}
            </>
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-gray-300" />
          </div>
        )}

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <span className="bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              Out of Stock
            </span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.is_new_arrival && <Badge variant="new">New</Badge>}
          {discount > 0 && <Badge variant="sale">-{discount}%</Badge>}
          {product.is_trending && <Badge variant="trending">Trending</Badge>}
        </div>

        {/* Wishlist button */}
        <button
          onClick={handleWishlistToggle}
          disabled={wishlistLoading}
          className={cn(
            'absolute top-2 right-2 h-8 w-8 rounded-full bg-white shadow flex items-center justify-center transition-all duration-200',
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
          'absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm py-2 px-3 text-center',
          'opacity-0 translate-y-full group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300'
        )}>
          <span className="text-xs font-semibold text-gray-900">Quick View</span>
        </div>
      </div>

      {/* Product info */}
      <div className="mt-3 space-y-1">
        <p className="text-xs text-gray-500">{product.categories?.[0]?.name}</p>
        <h3 className="text-sm font-medium text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-1">
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
