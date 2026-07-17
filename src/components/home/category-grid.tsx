import Link from 'next/link'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ArrowRight } from 'lucide-react'
import { Category } from '@/types'

interface CategoryGridProps {
  categories: Category[]
}


const FALLBACK_IMAGES = [
  '/images/home-man.jpg',
  '/images/home-woman.jpg',
  '/images/home-kids.jpg',
]

export function CategoryGrid({ categories }: CategoryGridProps) {
  if (categories.length === 0) return null

  const items = categories.slice(0, 6)
  const featured = items[0]
  const rest = items.slice(1)

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-3">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-widest mb-2">
              Collections
            </p>
            <h2 className="text-4xl font-black text-gray-900">Shop by Category</h2>
            <p className="text-gray-500 mt-2 text-lg">
              Find your style across our curated collections
            </p>
          </div>
          <Link
            href="/products"
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors group"
          >
            All Categories
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
          {/* Featured large card */}
          {featured && (
            <Link
              href={`/products?category=${featured.slug}`}
              className="col-span-2 row-span-2 group relative overflow-hidden rounded-3xl aspect-square"
            >
              {featured.image_url ? (
                <OptimizedImage
                  src={featured.image_url}
                  alt={featured.name}
                  fill
                  variant="categoryFeatured"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <OptimizedImage
                  src={FALLBACK_IMAGES[0]}
                  alt={featured.name}
                  fill
                  variant="categoryFeatured"
                  priority
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute bottom-0 left-0 right-0 p-8">
                <div className="inline-flex items-center gap-1 text-xs font-semibold text-white/60 uppercase tracking-widest mb-2">
                  <span className="h-px w-4 bg-white/40" /> Featured
                </div>
                <h3 className="text-3xl font-black text-white mb-2">{featured.name}</h3>
                <div className="flex items-center gap-2 text-white/70 text-sm font-medium opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                  Explore Collection <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          )}

          {/* Smaller cards */}
          {rest.map((category, index) => {
            return (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="group relative overflow-hidden rounded-2xl aspect-square"
              >
                {category.image_url ? (
                  <OptimizedImage
                    src={category.image_url}
                    alt={category.name}
                    fill
                    variant="category"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <OptimizedImage
                    src={FALLBACK_IMAGES[(index + 1) % FALLBACK_IMAGES.length]}
                    alt={category.name}
                    fill
                    variant="category"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end p-5">
                  <h3 className="text-lg font-bold text-white">{category.name}</h3>
                  <div className="flex items-center gap-1 text-white/60 text-xs font-medium mt-1 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200">
                    Shop now <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Mobile view all */}
        <div className="mt-6 text-center sm:hidden">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-600 hover:text-purple-700"
          >
            View All Categories <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
