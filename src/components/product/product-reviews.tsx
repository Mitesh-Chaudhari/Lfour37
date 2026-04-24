'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Star, ThumbsUp } from 'lucide-react'
import { Review } from '@/types'
import { StarRating } from '@/components/ui/star-rating'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeDate, getInitials } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { reviewSchema, ReviewFormData } from '@/lib/validations/checkout'

interface ProductReviewsProps {
  productId: string
  reviews: Review[]
  averageRating: number
  reviewCount: number
}

export function ProductReviews({ productId, reviews, averageRating, reviewCount }: ProductReviewsProps) {
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRating, setSelectedRating] = useState(5)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema) as any,
    defaultValues: { rating: 5 },
  })

  const ratingBreakdown = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: reviews.filter((rev) => rev.rating === r).length,
    percentage: reviews.length > 0 ? (reviews.filter((rev) => rev.rating === r).length / reviews.length) * 100 : 0,
  }))

  const onSubmit = async (data: ReviewFormData) => {
    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Please sign in to leave a review')
        return
      }

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, ...data, rating: selectedRating }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to submit review')
        return
      }

      toast.success('Review submitted! It will appear after moderation.')
      reset()
      setShowForm(false)
    } catch {
      toast.error('Failed to submit review')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="border-t border-gray-200 pt-12">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Customer Reviews ({reviewCount})
        </h2>
        <Button onClick={() => setShowForm(!showForm)} variant="outline">
          Write a Review
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-10">
        {/* Summary */}
        <div className="flex flex-col items-center justify-center bg-gray-50 rounded-2xl p-8">
          <span className="text-6xl font-bold text-gray-900 mb-2">
            {averageRating.toFixed(1)}
          </span>
          <StarRating rating={averageRating} size="lg" className="mb-2" />
          <span className="text-sm text-gray-500">{reviewCount} reviews</span>
        </div>

        {/* Breakdown */}
        <div className="lg:col-span-2 space-y-3">
          {ratingBreakdown.map(({ rating, count, percentage }) => (
            <div key={rating} className="flex items-center gap-3">
              <div className="flex items-center gap-1 w-16 flex-shrink-0">
                <span className="text-sm text-gray-600">{rating}</span>
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              </div>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-sm text-gray-600 w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Review form */}
      {showForm && (
        <div className="bg-gray-50 rounded-2xl p-6 mb-8">
          <h3 className="text-lg font-semibold mb-4">Write Your Review</h3>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Rating</label>
              <StarRating
                rating={selectedRating}
                size="lg"
                interactive
                onChange={setSelectedRating}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Title (optional)</label>
              <input
                {...register('title')}
                type="text"
                placeholder="Sum up your experience"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Review (optional)</label>
              <textarea
                {...register('body')}
                placeholder="Share your experience with this product..."
                rows={4}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={isSubmitting}>Submit Review</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Reviews list */}
      <div className="space-y-6">
        {reviews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No reviews yet. Be the first to review this product!</p>
          </div>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="border-b border-gray-100 pb-6 last:border-0">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {review.user?.avatar_url ? (
                    <Image src={review.user.avatar_url} alt="" width={40} height={40} className="object-cover" />
                  ) : (
                    <span className="text-purple-600 text-sm font-bold">
                      {getInitials(review.user?.full_name || 'A')}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="font-medium text-gray-900 text-sm">
                        {review.user?.full_name || 'Anonymous'}
                      </span>
                      {review.is_verified_purchase && (
                        <span className="ml-2 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          Verified Purchase
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatRelativeDate(review.created_at)}</span>
                  </div>
                  <StarRating rating={review.rating} size="sm" className="mb-2" />
                  {review.title && (
                    <p className="font-medium text-gray-900 text-sm mb-1">{review.title}</p>
                  )}
                  {review.body && (
                    <p className="text-sm text-gray-600 leading-relaxed">{review.body}</p>
                  )}
                  <button className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <ThumbsUp className="h-3 w-3" />
                    <span>Helpful ({review.helpful_count})</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
