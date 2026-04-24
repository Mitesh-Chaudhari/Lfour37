'use client'

import { useState } from 'react'
import { Review } from '@/types'
import { StarRating } from '@/components/ui/star-rating'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface AdminReviewsClientProps {
  reviews: (Review & {
    user?: { full_name: string | null; email: string }
    product?: { name: string; slug: string }
  })[]
}

export function AdminReviewsClient({ reviews: initialReviews }: AdminReviewsClientProps) {
  const [reviews, setReviews] = useState(initialReviews)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const supabase = createClient()

  const filtered = reviews.filter((r) => filter === 'all' || r.status === filter)

  const updateStatus = async (reviewId: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.from('reviews').update({ status }).eq('id', reviewId)
    if (!error) {
      setReviews(reviews.map((r) => r.id === reviewId ? { ...r, status } : r))
      toast.success(`Review ${status}`)
    }
  }

  const deleteReview = async (reviewId: string) => {
    if (!confirm('Delete this review?')) return
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
    if (!error) {
      setReviews(reviews.filter((r) => r.id !== reviewId))
      toast.success('Review deleted')
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              filter === s ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:border-purple-400'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="ml-1 text-xs opacity-70">
              ({reviews.filter((r) => s === 'all' || r.status === s).length})
            </span>
          </button>
        ))}
      </div>

      {/* Reviews list */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No reviews found</div>
        ) : (
          filtered.map((review) => (
            <div key={review.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <StarRating rating={review.rating} size="sm" />
                    <Badge variant={
                      review.status === 'approved' ? 'success' :
                      review.status === 'rejected' ? 'destructive' : 'warning'
                    }>
                      {review.status}
                    </Badge>
                    {review.is_verified_purchase && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        Verified Purchase
                      </span>
                    )}
                  </div>
                  {review.title && <p className="font-medium text-gray-900 text-sm">{review.title}</p>}
                  {review.body && <p className="text-sm text-gray-600 mt-1">{review.body}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>by {review.user?.full_name || review.user?.email}</span>
                    <span>on <a href={`/products/${review.product?.slug}`} className="text-purple-600 hover:underline">{review.product?.name}</a></span>
                    <span>{formatRelativeDate(review.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {review.status !== 'approved' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(review.id, 'approved')}
                      className="text-green-600 border-green-300 hover:bg-green-50">
                      Approve
                    </Button>
                  )}
                  {review.status !== 'rejected' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(review.id, 'rejected')}
                      className="text-red-600 border-red-300 hover:bg-red-50">
                      Reject
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => deleteReview(review.id)}
                    className="text-red-500 hover:bg-red-50">
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
