'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { ChevronLeft, ChevronRight, ZoomIn, Share2, Check } from 'lucide-react'
import { ProductImage } from '@/types'
import { normalizeProductImages } from '@/lib/product-images'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ProductGalleryProps {
  images: ProductImage[]
  productName: string
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const galleryImages = useMemo(() => normalizeProductImages(images), [images])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isZoomed, setIsZoomed] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [copied, setCopied] = useState(false)
  const [isImageLoading, setIsImageLoading] = useState(true)
  
  // Refs to track touch coordinates for swiping
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  const currentImage = galleryImages[selectedIndex]

  useEffect(() => {
    setSelectedIndex((index) =>
      index >= galleryImages.length ? 0 : index
    )
  }, [galleryImages.length])

  useEffect(() => {
    setIsZoomed(false)
  }, [selectedIndex])

  useEffect(() => {
    setIsImageLoading(true)
  }, [selectedIndex, currentImage?.url])

  const prev = () =>
    setSelectedIndex((i) => (i === 0 ? galleryImages.length - 1 : i - 1))
  const next = () =>
    setSelectedIndex((i) => (i === galleryImages.length - 1 ? 0 : i + 1))

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMousePosition({ x, y })
  }

  // Touch handlers for mobile swiping
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Don't register swipes if the user is zoomed in
    if (isZoomed) return
    touchStartX.current = e.targetTouches[0].clientX
    touchEndX.current = null
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isZoomed) return
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (isZoomed || !touchStartX.current || !touchEndX.current) return

    const diffX = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50 // Minimum swipe distance in pixels to trigger a flip

    if (diffX > minSwipeDistance) {
      next() // Swiped left -> next image
    } else if (diffX < -minSwipeDistance) {
      prev() // Swiped right -> previous image
    }

    // Reset values
    touchStartX.current = null
    touchEndX.current = null
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: productName, url })
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (galleryImages.length === 0) {
    return (
      <div className="aspect-square bg-gray-100 rounded-2xl flex items-center justify-center">
        <span className="text-gray-400">No images available</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Main image container with touch events added */}
      <div
        className={cn(
          'relative aspect-square rounded-2xl overflow-hidden bg-white cursor-zoom-in touch-pan-y',
          isZoomed && 'cursor-zoom-out'
        )}
        onClick={() => setIsZoomed(!isZoomed)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if (isZoomed) setIsZoomed(false) }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <LoadingOverlay show={isImageLoading} className="z-10" />

        {currentImage?.url && (
          <OptimizedImage
            key={`gallery-main-${selectedIndex}-${currentImage.url}`}
            src={currentImage.url}
            alt={currentImage.alt || productName}
            fill
            variant="gallery"
            priority={selectedIndex === 0}
            loading="eager"
            onLoad={() => setIsImageLoading(false)}
            onError={() => setIsImageLoading(false)}
            className={cn(
              'object-contain transition-all duration-200 select-none',
              isZoomed && 'scale-200',
              isImageLoading && 'opacity-0'
            )}
            style={
              isZoomed
                ? { transformOrigin: `${mousePosition.x}% ${mousePosition.y}%` }
                : undefined
            }
          />
        )}

        {/* Navigation arrows (hidden on touch screens via md:flex) */}
        {galleryImages.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); prev() }}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 shadow items-center justify-center hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5 text-gray-700" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next() }}
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 shadow items-center justify-center hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronRight className="h-5 w-5 text-gray-700" />
            </button>
          </>
        )}

        {/* Zoom indicator */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <div className="bg-white/90 rounded-full px-2 py-1 flex items-center gap-1 text-xs text-gray-600">
            <ZoomIn className="h-3 w-3" />
            <span>Click to zoom</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleShare() }}
            className="h-8 w-8 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4 text-gray-600" />}
          </button>
        </div>

        {/* Image counter / indicator dots */}
        {galleryImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {galleryImages.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setSelectedIndex(i) }}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === selectedIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {galleryImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {galleryImages.map((img, i) => (
            <button
              key={`gallery-thumb-${i}-${img.url}`}
              onClick={() => setSelectedIndex(i)}
              className={cn(
                'relative h-20 w-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                i === selectedIndex ? 'border-purple-600' : 'border-transparent hover:border-gray-300'
              )}
            >
              <OptimizedImage
                src={img.url}
                alt={img.alt || `Image ${i + 1}`}
                fill
                variant="galleryThumb"
                loading="eager"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}