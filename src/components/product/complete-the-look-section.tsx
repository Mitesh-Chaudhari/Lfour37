import type { ListingProduct } from '@/lib/catalog-queries'
import { ProductCard } from '@/components/product/product-card'

interface CompleteTheLookSectionProps {
  products: ListingProduct[]
  subtitle?: string
}

export function CompleteTheLookSection({
  products,
  subtitle,
}: CompleteTheLookSectionProps) {
  if (!products.length) return null

  return (
    <section className="mb-16">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#c39c41]">
          Style it together
        </p>
        <h2 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
          Complete the look
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm text-gray-500 sm:text-base">{subtitle}</p>
        )}
      </div>

      {/* Mobile: snap carousel · Desktop: 4-column row */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 lg:gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="w-[68%] shrink-0 snap-start sm:w-auto sm:shrink"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  )
}
