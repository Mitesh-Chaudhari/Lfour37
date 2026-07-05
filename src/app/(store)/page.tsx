import { createClient } from '@/lib/supabase/server'
import { HeroBanner } from '@/components/home/hero-banner'
import { getActiveHeroSlides } from '@/lib/hero-slides'
import { enrichProductsWithBestSeller, getBestSellerProductIds } from '@/lib/products'
import { CategoryGrid } from '@/components/home/category-grid'
import { ProductSection } from '@/components/home/product-section'
import { PromoBanner } from '@/components/home/promo-banner'
import { NewsletterSection } from '@/components/home/newsletter-section'
import { TrustBadges } from '@/components/home/trust-badges'
// import { BrandsMarquee } from '@/components/home/brands-marquee'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lfour37 - Premium Clothing Brand',
  description: 'Discover premium clothing for men, women, and kids. Shop the latest styles with fast shipping and easy returns.',
}

async function getHomeData() {
  const supabase = await createClient()

  const [featuredRes, newArrivalsRes, trendingRes, categoriesRes, heroSlides] =
    await Promise.all([
    supabase
      .from('products')
      .select('*, variants:product_variants(*), categories:product_categories(category:categories(*))')
      .eq('status', 'active')
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(8),

    supabase
      .from('products')
      .select('*, variants:product_variants(*), categories:product_categories(category:categories(*))')
      .eq('status', 'active')
      .eq('is_new_arrival', true)
      .order('created_at', { ascending: false })
      .limit(8),

    supabase
      .from('products')
      .select('*, variants:product_variants(*), categories:product_categories(category:categories(*))')
      .eq('status', 'active')
      .eq('is_trending', true)
      .order('total_sold', { ascending: false })
      .limit(8),

    supabase
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('is_active', true),

    getActiveHeroSlides(),
  ])

  const allCategories = categoriesRes.data || []
  const bestSellerIds = await getBestSellerProductIds(supabase)

  return {
    featured: enrichProductsWithBestSeller(featuredRes.data || [], bestSellerIds),
    newArrivals: enrichProductsWithBestSeller(newArrivalsRes.data || [], bestSellerIds),
    trending: enrichProductsWithBestSeller(trendingRes.data || [], bestSellerIds),
    categories: allCategories.filter((category) => !category.parent_id),
    heroSlides,
  }
}

export default async function HomePage() {
  const { featured, newArrivals, trending, categories, heroSlides } =
    await getHomeData()

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

      {/* <PromoBanner
        title="New Season, New You"
        subtitle="Up to 50% off on selected items"
        backgroundGradient="bg-primary"
        href="/products?filter=sale"
        ctaText="Shop the Sale"
      /> */}

      {newArrivals.length > 0 && (
        <ProductSection
          badge="Just Landed"
          title="New Arrivals"
          subtitle="Fresh styles just landed"
          products={newArrivals}
          viewAllHref="/products?filter=new"
        />
      )}

      {/* <PromoBanner
        title="Trending This Season"
        subtitle="Shop what everyone is wearing right now"
        backgroundGradient="bg-dark"
        href="/products?filter=trending"
        ctaText="Shop Trending"
      /> */}

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
