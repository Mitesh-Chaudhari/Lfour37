'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  rating: number
  maxRating?: number
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  onChange?: (rating: number) => void
  className?: string
}

export function StarRating({
  rating,
  maxRating = 5,
  size = 'md',
  interactive = false,
  onChange,
  className,
}: StarRatingProps) {
  const sizes = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-6 w-6' }
  const starSize = sizes[size]

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {Array.from({ length: maxRating }, (_, i) => {
        const filled = i + 1 <= Math.round(rating)
        const partial = !filled && i < rating && rating % 1 > 0

        return (
          <button
            key={i}
            type={interactive ? 'button' : undefined}
            onClick={interactive && onChange ? () => onChange(i + 1) : undefined}
            className={cn(
              'relative',
              interactive && 'cursor-pointer hover:scale-110 transition-transform',
              !interactive && 'cursor-default pointer-events-none'
            )}
          >
            <Star
              className={cn(
                starSize,
                filled ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'
              )}
            />
            {partial && (
              <Star
                className={cn(starSize, 'absolute inset-0 fill-yellow-400 text-yellow-400')}
                style={{ clipPath: `inset(0 ${100 - (rating % 1) * 100}% 0 0)` }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
