'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { ChevronLeft, ChevronRight, ZoomIn, Share2, Check, X } from 'lucide-react'
import { ProductImage } from '@/types'
import { normalizeProductImages } from '@/lib/product-images'
import { DEFAULT_PRODUCT_IMAGE } from '@/lib/images'
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
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set())
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  
  // Refs to track touch coordinates for swiping
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const touchMoved = useRef(false)
  const lightboxTouchStartX = useRef<number | null>(null)
  const lightboxTouchEndX = useRef<number | null>(null)

  const currentImage = galleryImages[selectedIndex]

  const imageTransitionClass =
    'object-contain transition-opacity duration-700 ease-in-out select-none'

  const markImageLoaded = (url: string) => {
    setLoadedUrls((current) => {
      if (current.has(url)) return current
      const next = new Set(current)
      next.add(url)
      return next
    })
  }

  const isImageLoading = Boolean(
    currentImage?.url && !loadedUrls.has(currentImage.url)
  )

  useEffect(() => {
    setLoadedUrls(new Set())
  }, [galleryImages])

  useEffect(() => {
    setSelectedIndex((index) =>
      index >= galleryImages.length ? 0 : index
    )
  }, [galleryImages.length])

  useEffect(() => {
    setIsZoomed(false)
  }, [selectedIndex])

  useEffect(() => {
    if (!isFullscreenOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreenOpen])

  const prev = () =>
    setSelectedIndex((i) => (i === 0 ? galleryImages.length - 1 : i - 1))
  const next = () =>
    setSelectedIndex((i) => (i === galleryImages.length - 1 ? 0 : i + 1))

  const handleSwipeEnd = (
    startX: number | null,
    endX: number | null,
    onSwipeLeft: () => void,
    onSwipeRight: () => void
  ) => {
    if (startX === null || endX === null) return false

    const diffX = startX - endX
    const minSwipeDistance = 50

    if (diffX > minSwipeDistance) {
      onSwipeLeft()
      return true
    }

    if (diffX < -minSwipeDistance) {
      onSwipeRight()
      return true
    }

    return false
  }

  const isMobileViewport = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches

  const handleMainClick = () => {
    if (touchMoved.current) return

    if (isMobileViewport()) {
      setIsFullscreenOpen(true)
      return
    }

    setIsZoomed((value) => !value)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed || isMobileViewport()) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMousePosition({ x, y })
  }

  // Touch handlers for mobile swiping
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport() && isZoomed) return
    touchMoved.current = false
    touchStartX.current = e.targetTouches[0].clientX
    touchEndX.current = null
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport() && isZoomed) return
    touchEndX.current = e.targetTouches[0].clientX
    if (
      touchStartX.current !== null &&
      Math.abs(e.targetTouches[0].clientX - touchStartX.current) > 10
    ) {
      touchMoved.current = true
    }
  }

  const handleTouchEnd = () => {
    if (!isMobileViewport() && isZoomed) return

    handleSwipeEnd(touchStartX.current, touchEndX.current, next, prev)

    touchStartX.current = null
    touchEndX.current = null
  }

  const handleLightboxTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    lightboxTouchStartX.current = e.targetTouches[0].clientX
    lightboxTouchEndX.current = null
  }

  const handleLightboxTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    lightboxTouchEndX.current = e.targetTouches[0].clientX
  }

  const handleLightboxTouchEnd = () => {
    handleSwipeEnd(
      lightboxTouchStartX.current,
      lightboxTouchEndX.current,
      next,
      prev
    )

    lightboxTouchStartX.current = null
    lightboxTouchEndX.current = null
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
          'relative aspect-square rounded-2xl overflow-hidden bg-white touch-pan-y',
          'cursor-pointer md:cursor-zoom-in',
          isZoomed && 'md:cursor-zoom-out'
        )}
        onClick={handleMainClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if (isZoomed) setIsZoomed(false) }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <LoadingOverlay show={isImageLoading} className="z-10" />

        {galleryImages.map((img, i) => (
          <OptimizedImage
            key={`gallery-main-${img.url}`}
            src={img.url}
            alt={img.alt || productName}
            fill
            variant="gallery"
            priority={i === 0}
            loading="eager"
            onLoad={() => markImageLoaded(img.url)}
            onError={() => markImageLoaded(img.url)}
            className={cn(
              imageTransitionClass,
              i === selectedIndex
                ? 'opacity-100 z-[1]'
                : 'opacity-0 z-0 pointer-events-none',
              isZoomed &&
                i === selectedIndex &&
                'md:scale-[2] md:transition-[opacity,transform] md:duration-200',
              isImageLoading && i === selectedIndex && 'opacity-0'
            )}
            style={
              isZoomed && i === selectedIndex
                ? { transformOrigin: `${mousePosition.x}% ${mousePosition.y}%` }
                : undefined
            }
          />
        ))}

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

        {/* Zoom indicator (desktop only) */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <div className="hidden md:flex bg-white/90 rounded-full px-2 py-1 items-center gap-1 text-xs text-gray-600">
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
                  'h-1.5 rounded-full transition-all duration-500 ease-in-out',
                  i === selectedIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile fullscreen image viewer */}
      {isFullscreenOpen && currentImage?.url && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} image gallery`}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <p className="text-sm font-medium">
              {selectedIndex + 1} / {galleryImages.length}
            </p>
            <button
              type="button"
              onClick={() => setIsFullscreenOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
              aria-label="Close image viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="relative flex-1"
            onTouchStart={handleLightboxTouchStart}
            onTouchMove={handleLightboxTouchMove}
            onTouchEnd={handleLightboxTouchEnd}
          >
            <LoadingOverlay
              show={isImageLoading}
              className="z-10 bg-black/60"
            />

            {galleryImages.map((img, i) => (
              <OptimizedImage
                key={`gallery-lightbox-${img.url}`}
                src={img.url}
                alt={img.alt || productName}
                fill
                variant="gallery"
                loading="eager"
                onLoad={() => markImageLoaded(img.url)}
                onError={() => markImageLoaded(img.url)}
                className={cn(
                  imageTransitionClass,
                  i === selectedIndex
                    ? 'opacity-100 z-[1]'
                    : 'opacity-0 z-0 pointer-events-none',
                  isImageLoading && i === selectedIndex && 'opacity-0'
                )}
              />
            ))}

            {galleryImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {galleryImages.length > 1 && (
            <div className="flex justify-center gap-1.5 px-4 py-4">
              {galleryImages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500 ease-in-out',
                    i === selectedIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
                  )}
                  aria-label={`View image ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Thumbnail strip */}
      {galleryImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {galleryImages.map((img, i) => (
            <button
              key={`gallery-thumb-${i}-${img.url}`}
              onClick={() => setSelectedIndex(i)}
              className={cn(
                'relative h-20 w-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-500 ease-in-out',
                i === selectedIndex ? 'border-purple-600' : 'border-transparent hover:border-gray-300'
              )}
            >
              <OptimizedImage
                src={img.url}
                alt={img.alt || `Image ${i + 1}`}
                fill
                variant="galleryThumb"
                loading="eager"
                placeholderImage={DEFAULT_PRODUCT_IMAGE}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}