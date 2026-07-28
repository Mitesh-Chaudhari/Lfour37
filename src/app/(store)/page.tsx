import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/server'
import { LISTING_PRODUCT_SELECT } from '@/lib/catalog-queries'
import type { ListingProduct } from '@/lib/catalog-queries'
import { HeroBanner } from '@/components/home/hero-banner'
import { getActiveHeroSlides } from '@/lib/hero-slides'
import { enrichProductsWithBestSeller, getBestSellerProductIds } from '@/lib/products'
import { ProductSection } from '@/components/home/product-section'
import { NewsletterSection } from '@/components/home/newsletter-section'
import { TrustBadges } from '@/components/home/trust-badges'
import { withTimeout } from '@/lib/fetch-with-timeout'
import type { HeroSlide } from '@/lib/hero-slides'
import type { Metadata } from 'next'

/** Skip build-time static generation — data is fetched at runtime with cache. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Lfour37 - Premium Clothing Brand',
  description: 'Discover premium clothing for men, women, and kids. Shop the latest styles with fast shipping and easy returns.',
}

type HomeData = {
  featured: ListingProduct[]
  newArrivals: ListingProduct[]
  trending: ListingProduct[]
  heroSlides: HeroSlide[]
}

async function fetchHomeData(): Promise<HomeData> {
  const supabase = createPublicClient()

  const [featuredRes, newArrivalsRes, trendingRes, heroSlides, bestSellerIds] =
    await Promise.all([
      supabase
        .from('products')
        .select(LISTING_PRODUCT_SELECT)
        .eq('status', 'active')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(8),

      supabase
        .from('products')
        .select(LISTING_PRODUCT_SELECT)
        .eq('status', 'active')
        .eq('is_new_arrival', true)
        .order('created_at', { ascending: false })
        .limit(8),

      supabase
        .from('products')
        .select(LISTING_PRODUCT_SELECT)
        .eq('status', 'active')
        .eq('is_trending', true)
        .order('total_sold', { ascending: false })
        .limit(8),

      getActiveHeroSlides(),
      getBestSellerProductIds(),
    ])

  return {
    featured: enrichProductsWithBestSeller(
      (featuredRes.data || []) as ListingProduct[],
      bestSellerIds
    ),
    newArrivals: enrichProductsWithBestSeller(
      (newArrivalsRes.data || []) as ListingProduct[],
      bestSellerIds
    ),
    trending: enrichProductsWithBestSeller(
      (trendingRes.data || []) as ListingProduct[],
      bestSellerIds
    ),
    heroSlides,
  }
}

const getHomeData = unstable_cache(
  async () =>
    withTimeout(fetchHomeData(), {
      featured: [],
      newArrivals: [],
      trending: [],
      heroSlides: [],
    }),
  ['home-page-data'],
  { revalidate: 60 }
)

export default async function HomePage() {
  const { featured, newArrivals, trending, heroSlides } = await getHomeData()

  return (
    <>
      <HeroBanner initialSlides={heroSlides} />
      {/* <BrandsMarquee /> */}
      {/* <CategoryGrid categories={categories} /> */}

      {featured.length > 0 && (
        <ProductSection
          badge="Hand-Picked"
          title="Featured Products"
          subtitle="Handpicked selections just for you"
          products={featured}
          viewAllHref="/products?filter=featured"
        />
      )}

      {newArrivals.length > 0 && (
        <ProductSection
          badge="Just Landed"
          title="New Arrivals"
          subtitle="Fresh styles just landed"
          products={newArrivals}
          viewAllHref="/products?filter=new"
        />
      )}

      {trending.length > 0 && (
        <ProductSection
          badge="Most Popular"
          title="Trending Now"
          subtitle="What everyone is wearing"
          products={trending}
          viewAllHref="/products?filter=trending"
        />
      )}
      <TrustBadges />
      <NewsletterSection />
    </>
  )
}
