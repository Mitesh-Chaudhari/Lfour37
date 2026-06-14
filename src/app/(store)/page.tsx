import { createClient } from '@/lib/supabase/server'
import { HeroBanner } from '@/components/home/hero-banner'
import { CategoryGrid } from '@/components/home/category-grid'
import { ProductSection } from '@/components/home/product-section'
import { PromoBanner } from '@/components/home/promo-banner'
import { NewsletterSection } from '@/components/home/newsletter-section'
import { TrustBadges } from '@/components/home/trust-badges'
// import { BrandsMarquee } from '@/components/home/brands-marquee'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lfour37 - Premium Clothing Marketplace',
  description: 'Discover premium clothing for men, women, and kids. Shop the latest styles with fast shipping and easy returns.',
}

async function getHomeData() {
  const supabase = await createClient()

  const [featuredRes, newArrivalsRes, trendingRes, categoriesRes] = await Promise.all([
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
      .select('*')
      .eq('is_active', true)
      .is('parent_id', null)
      .order('sort_order', { ascending: true }),
  ])

  return {
    featured: featuredRes.data || [],
    newArrivals: newArrivalsRes.data || [],
    trending: trendingRes.data || [],
    categories: categoriesRes.data || [],
  }
}

export default async function HomePage() {
  const { featured, newArrivals, trending, categories } = await getHomeData()

  return (
    <>
      <HeroBanner />
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
