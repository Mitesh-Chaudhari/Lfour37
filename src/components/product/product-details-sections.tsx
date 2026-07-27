'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  Factory,
  Truck,
  RefreshCw,
  Star,
  Plus,
  Minus,
} from 'lucide-react'
import type { Product } from '@/types'
import {
  normalizeKeyHighlights,
  PRODUCT_INFO_STATIC,
  PRODUCT_WASH_CARE_ITEMS,
} from '@/lib/product-details'

function WashCareIcon({
  icon,
}: {
  icon: (typeof PRODUCT_WASH_CARE_ITEMS)[number]['icon']
}) {
  const common = 'h-7 w-7 text-[#c39c41]'

  switch (icon) {
    case 'machine-wash':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="13" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="13" r="2" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="6.5" r="0.9" fill="currentColor" />
          <circle cx="11" cy="6.5" r="0.9" fill="currentColor" />
        </svg>
      )
    case 'cold-wash':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <path
            d="M5 8h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M5 11h14" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'reverse-dry':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <path d="M6 5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12 5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M8 8h8l-1.2 10.2a2 2 0 0 1-2 1.8h-1.6a2 2 0 0 1-2-1.8L8 8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'avoid-sun':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M5.8 18.2l1.6-1.6M16.6 7.4l1.6-1.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

interface ProductDetailsSectionsProps {
  product: Product
}

export function ProductDetailsSections({ product }: ProductDetailsSectionsProps) {
  const highlights = normalizeKeyHighlights(product.key_highlights)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const ratingLabel =
    product.review_count > 0
      ? `${product.average_rating.toFixed(1)}/5`
      : 'New'

  const sections = [
    {
      id: 'description',
      title: 'Product Description',
      subtitle: 'Details and Highlights',
      icon: FileText,
      content: product.description?.trim() || 'No description available.',
    },
    {
      id: 'manufacturing',
      title: PRODUCT_INFO_STATIC.manufacturing.title,
      subtitle: PRODUCT_INFO_STATIC.manufacturing.subtitle,
      icon: Factory,
      content: PRODUCT_INFO_STATIC.manufacturing.body,
    },
    {
      id: 'shipping',
      title: PRODUCT_INFO_STATIC.shipping.title,
      subtitle: PRODUCT_INFO_STATIC.shipping.subtitle,
      icon: Truck,
      content: PRODUCT_INFO_STATIC.shipping.body,
    },
    {
      id: 'returns',
      title: PRODUCT_INFO_STATIC.returns.title,
      subtitle: PRODUCT_INFO_STATIC.returns.subtitle,
      icon: RefreshCw,
      content: PRODUCT_INFO_STATIC.returns.body,
      footer: (
        <Link
          href="/return-refund"
          className="inline-block mt-3 text-sm font-medium text-purple-600 hover:underline"
        >
          View return policy
        </Link>
      ),
    },
    {
      id: 'reviews',
      title: `Reviews ${ratingLabel}`,
      subtitle: 'Based on customer reviews',
      icon: Star,
      content:
        product.review_count > 0
          ? `This product has an average rating of ${product.average_rating.toFixed(1)} based on ${product.review_count} review${product.review_count === 1 ? '' : 's'}.`
          : 'No reviews yet. Be the first to review this product.',
      footer: (
        <a
          href="#reviews"
          className="inline-block mt-3 text-sm font-medium text-purple-600 hover:underline"
        >
          {product.review_count > 0 ? 'Read all reviews' : 'Write a review'}
        </a>
      ),
    },
  ]

  return (
    <div className="space-y-8 pt-2">
      {highlights.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-gray-900 mb-4">Key Highlights</h3>
          <div className="grid grid-cols-2 gap-x-6">
            {highlights.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="py-3 border-b border-gray-200"
              >
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className="text-sm font-semibold text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-base font-bold text-gray-900 mb-4">Wash Care</h3>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {PRODUCT_WASH_CARE_ITEMS.map((item) => (
            <div key={item.id} className="flex flex-col items-center text-center gap-2">
              <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
                <WashCareIcon icon={item.icon} />
              </div>
              <p className="text-[11px] sm:text-xs text-gray-800 leading-tight">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-gray-900 mb-2">Product Information</h3>
        <div className="divide-y divide-gray-200 border-t border-gray-200">
          {sections.map((section) => {
            const Icon = section.icon
            const isOpen = openSection === section.id

            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSection(isOpen ? null : section.id)
                  }
                  className="flex w-full items-start gap-3 py-4 text-left"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[#c39c41]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">
                      {section.title}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {section.subtitle}
                    </span>
                  </span>
                  <span className="mt-1 text-gray-500">
                    {isOpen ? (
                      <Minus className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {isOpen && (
                  <div className="pb-4 pl-11 pr-2">
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                      {section.content}
                    </p>
                    {'footer' in section ? section.footer : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
