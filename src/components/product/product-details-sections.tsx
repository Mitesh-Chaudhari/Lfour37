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
    case 'machine-wash-cold':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="13" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="13" r="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M16 6.5h1.5M16 8.5h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path
            d="M7.5 6.2c.4-.8 1.2-1.2 2-1.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'inside-out':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <path
            d="M8 6.5h8l1.5 2.5v9.5a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2V6.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M8 6.5 12 4l4 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path
            d="M9.5 11.5c1.2 1.2 3.8 1.2 5 0"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path d="M14.5 9.5 16 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'mild-detergent':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <path
            d="M9 4.5h6l1 3H8l1-3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <rect x="8" y="7.5" width="8" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 11h4M10 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'no-bleach':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <path
            d="M10 4.5h4l1 2.5H9l1-2.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <rect x="9" y="7" width="6" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 10.5h2M11 13.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="m6.5 6.5 11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'no-iron-print':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <path
            d="M5.5 14.5h13l-1.2-4.5H6.7L5.5 14.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M8.5 10h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12 14.5v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="9" r="1.2" fill="currentColor" />
          <path d="m6.5 6.5 11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'dry-shade':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <path
            d="M6 16.5h12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M8 16.5V13a4 4 0 0 1 8 0v3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M15.5 8.5c1.2-1.1 2.8-1.5 4-1.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path d="M14 7.5 15.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'no-tumble-dry':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} aria-hidden>
          <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M9.5 9.5c1.2 2.2 3.8 2.2 5 0M9.5 14.5c1.2-2.2 3.8-2.2 5 0"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path d="m6.5 6.5 11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {PRODUCT_WASH_CARE_ITEMS.map((item) => (
            <div key={item.id} className="flex flex-col items-center text-center gap-2">
              <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
                <WashCareIcon icon={item.icon} />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-800 leading-snug px-1">
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
