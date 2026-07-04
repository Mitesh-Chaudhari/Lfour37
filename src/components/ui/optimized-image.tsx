'use client'

import { useEffect, useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { cn } from '@/lib/utils'
import {
  DEFAULT_IMAGE_QUALITY,
  IMAGE_BLUR_DATA_URL,
  IMAGE_SIZE_PRESETS,
  getSupabaseTransformedImageSrc,
  isOptimizableImageSrc,
  shouldUseUnoptimizedImage,
  type OptimizedImageVariant,
} from '@/lib/images'

export interface OptimizedImageProps extends Omit<ImageProps, 'src' | 'alt'> {
  src?: string | null
  alt: string
  variant?: OptimizedImageVariant
  /** Skip Next.js optimization (blob/data URLs, AI output, etc.) */
  unoptimized?: boolean
  showFallback?: boolean
  fallbackClassName?: string
  /** Local placeholder shown until `src` finishes loading (e.g. product default image) */
  placeholderImage?: string
  placeholderClassName?: string
}

export function OptimizedImage({
  src,
  alt,
  variant,
  sizes,
  quality = DEFAULT_IMAGE_QUALITY,
  className,
  fallbackClassName,
  placeholderClassName,
  placeholderImage,
  priority,
  unoptimized,
  showFallback = true,
  placeholder,
  blurDataURL,
  onError,
  onLoad,
  fill,
  ...props
}: OptimizedImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [useOriginalSrc, setUseOriginalSrc] = useState(false)

  const resolvedQuality = Number(quality)
  const transformedSrc = getSupabaseTransformedImageSrc(src, variant, resolvedQuality)
  const canUseTransform = Boolean(transformedSrc && transformedSrc !== src)

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
    setUseOriginalSrc(false)
  }, [src, variant, quality])

  const isValidSrc = isOptimizableImageSrc(src)
  const resolvedSrc =
    useOriginalSrc || !canUseTransform ? src : transformedSrc
  const skipOptimization = Boolean(unoptimized || shouldUseUnoptimizedImage(resolvedSrc))
  const resolvedSizes = sizes ?? (variant ? IMAGE_SIZE_PRESETS[variant] : undefined)
  const useDefaultPlaceholder = Boolean(placeholderImage)
  const useBlur =
    isValidSrc &&
    !skipOptimization &&
    !priority &&
    placeholder !== 'empty' &&
    !useDefaultPlaceholder
  const resolvedPlaceholder = useBlur ? 'blur' : 'empty'
  const resolvedBlur = useBlur ? (blurDataURL ?? IMAGE_BLUR_DATA_URL) : undefined

  const handleImageError: ImageProps['onError'] = (event) => {
    if (canUseTransform && !useOriginalSrc) {
      setUseOriginalSrc(true)
      setLoaded(false)
      return
    }

    setFailed(true)
    onError?.(event)
  }

  const placeholderLayerClassName = cn(
    'object-cover',
    fill && 'absolute inset-0 z-0',
    placeholderClassName,
    !fill && className
  )

  const renderPlaceholderLayer = () => {
    if (!placeholderImage) return null

    return (
      <Image
        src={placeholderImage}
        alt=""
        aria-hidden
        fill={fill}
        sizes={resolvedSizes}
        unoptimized
        className={placeholderLayerClassName}
      />
    )
  }

  if (!isValidSrc || failed) {
    if (placeholderImage) {
      return renderPlaceholderLayer()
    }

    if (!showFallback) return null
    return (
      <div
        className={cn(
          'bg-gray-100',
          fill && 'absolute inset-0',
          fallbackClassName,
          !fill && className
        )}
        aria-hidden={!alt}
      />
    )
  }

  const imageSrc =
    !useOriginalSrc && canUseTransform && transformedSrc
      ? transformedSrc
      : src

  if (!useDefaultPlaceholder) {
    return (
      <Image
        key={imageSrc}
        src={imageSrc}
        alt={alt}
        fill={fill}
        quality={quality}
        className={className}
        sizes={resolvedSizes}
        priority={priority}
        unoptimized={skipOptimization}
        placeholder={resolvedPlaceholder}
        blurDataURL={resolvedBlur}
        onError={handleImageError}
        onLoad={onLoad}
        {...props}
      />
    )
  }

  return (
    <>
      {renderPlaceholderLayer()}
      <Image
        key={imageSrc}
        src={imageSrc}
        alt={alt}
        fill={fill}
        quality={quality}
        className={cn(
          className,
          fill && 'absolute inset-0 z-[1]',
          'transition-opacity duration-300 ease-in-out',
          !loaded && 'opacity-0'
        )}
        sizes={resolvedSizes}
        priority={priority}
        unoptimized={skipOptimization}
        placeholder="empty"
        onError={handleImageError}
        onLoad={(event) => {
          setLoaded(true)
          onLoad?.(event)
        }}
        {...props}
      />
    </>
  )
}
