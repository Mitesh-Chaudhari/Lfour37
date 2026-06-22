'use client'

import { useState } from 'react'
import Image, { type ImageProps } from 'next/image'
import { cn } from '@/lib/utils'
import {
  DEFAULT_IMAGE_QUALITY,
  IMAGE_BLUR_DATA_URL,
  IMAGE_SIZE_PRESETS,
  isOptimizableImageSrc,
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
}

export function OptimizedImage({
  src,
  alt,
  variant,
  sizes,
  quality = DEFAULT_IMAGE_QUALITY,
  className,
  fallbackClassName,
  priority,
  unoptimized,
  showFallback = true,
  placeholder,
  blurDataURL,
  onError,
  ...props
}: OptimizedImageProps) {
  const [failed, setFailed] = useState(false)

  const canOptimize = isOptimizableImageSrc(src) && !unoptimized
  const resolvedSizes = sizes ?? (variant ? IMAGE_SIZE_PRESETS[variant] : undefined)
  const useBlur = canOptimize && !priority && placeholder !== 'empty'
  const resolvedPlaceholder = useBlur ? 'blur' : 'empty'
  const resolvedBlur = useBlur ? (blurDataURL ?? IMAGE_BLUR_DATA_URL) : undefined

  if (!canOptimize || failed) {
    if (!showFallback) return null
    return (
      <div
        className={cn('bg-gray-100', fallbackClassName, !props.fill && className)}
        aria-hidden={!alt}
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      quality={quality}
      className={className}
      sizes={resolvedSizes}
      priority={priority}
      placeholder={resolvedPlaceholder}
      blurDataURL={resolvedBlur}
      onError={(event) => {
        setFailed(true)
        onError?.(event)
      }}
      {...props}
    />
  )
}
