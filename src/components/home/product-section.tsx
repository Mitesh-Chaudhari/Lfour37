import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Product } from '@/types'
import { ProductCard } from '@/components/product/product-card'

interface ProductSectionProps {
  title: string
  subtitle?: string
  products: Product[]
  viewAllHref?: string
  badge?: string
}

export function ProductSection({ title, subtitle, products, viewAllHref, badge }: ProductSectionProps) {
  return (
    <section className="pt-20 bg-white">
      <div className="container mx-auto px-3">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            {badge && (
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-widest mb-2">{badge}</p>
            )}
            <h2 className="text-4xl font-black text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-gray-500 mt-2 text-lg">{subtitle}</p>
            )}
          </div>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors group"
            >
              View All
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>

        {/* Products */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* Mobile view all */}
        {viewAllHref && (
          <div className="mt-8 text-center sm:hidden">
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700 border border-purple-200 rounded-full px-6 py-2.5"
            >
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
