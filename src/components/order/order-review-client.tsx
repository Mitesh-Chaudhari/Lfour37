'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ReviewableOrderItem = {
  id: string
  product_id: string
  product_name: string
  product_image: string | null
  product_slug: string | null
  variant_size: string | null
  variant_color: string | null
  already_reviewed: boolean
}

export function OrderReviewClient({
  orderNumber,
  items: initialItems,
}: {
  orderNumber: string
  items: ReviewableOrderItem[]
}) {
  const [items, setItems] = useState(initialItems)
  const [activeId, setActiveId] = useState<string | null>(
    initialItems.find((item) => !item.already_reviewed)?.id || null
  )
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const active = items.find((item) => item.id === activeId) || null
  const pendingCount = items.filter((item) => !item.already_reviewed).length

  const submitReview = async () => {
    if (!active || active.already_reviewed) return
    if (rating < 1 || rating > 5) {
      toast.error('Please select a rating')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: active.product_id,
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || 'Failed to submit review')
        return
      }

      toast.success('Thanks! Your review was submitted for moderation.')
      setItems((prev) =>
        prev.map((item) =>
          item.id === active.id ? { ...item, already_reviewed: true } : item
        )
      )
      setTitle('')
      setBody('')
      setRating(5)
      const next = items.find(
        (item) => item.id !== active.id && !item.already_reviewed
      )
      setActiveId(next?.id || null)
    } catch {
      toast.error('Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <p className="text-xs tracking-[0.2em] uppercase text-gray-400 mb-2">
          LFOUR37
        </p>
        <h1 className="text-2xl font-bold text-gray-900">Share your review</h1>
        <p className="text-gray-500 mt-1">
          Order <span className="font-mono text-gray-800">{orderNumber}</span>
          {pendingCount > 0
            ? ` · ${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting for a review`
            : ' · all items reviewed — thank you!'}
        </p>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.already_reviewed}
              onClick={() => setActiveId(item.id)}
              className={cn(
                'w-full flex gap-3 p-4 rounded-xl border text-left transition-colors',
                selected
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300',
                item.already_reviewed && 'opacity-60 cursor-default'
              )}
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {item.product_image ? (
                  <OptimizedImage
                    src={item.product_image}
                    alt={item.product_name}
                    fill
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 text-sm line-clamp-2">
                  {item.product_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[item.variant_size, item.variant_color]
                    .filter(Boolean)
                    .join(' / ') || 'Standard'}
                </p>
                {item.already_reviewed ? (
                  <p className="text-xs text-green-700 mt-1">Review submitted</p>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>

      {active && !active.already_reviewed ? (
        <div className="mt-8 rounded-2xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-900">
            Reviewing: {active.product_name}
          </p>

          <div>
            <p className="text-xs text-gray-500 mb-2">Your rating</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className="p-1"
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                >
                  <Star
                    className={cn(
                      'h-7 w-7',
                      value <= rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Title (optional)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Loved the fit"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Your review (optional)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={4}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Tell other shoppers what you liked..."
            />
          </div>

          <Button
            type="button"
            onClick={submitReview}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? 'Submitting…' : 'Submit review'}
          </Button>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/orders" className="text-gray-600 underline">
          Back to orders
        </Link>
        {active?.product_slug ? (
          <Link
            href={`/products/${active.product_slug}#reviews`}
            className="text-gray-600 underline"
          >
            View product page
          </Link>
        ) : null}
      </div>
    </div>
  )
}
