import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProductGallery } from '@/components/product/product-gallery'
import { ProductInfo } from '@/components/product/product-info'
import { ProductReviews } from '@/components/product/product-reviews'
import { ProductSection } from '@/components/home/product-section'
import { SizeGuideList } from '@/components/size-guide/size-guide-section'
import { getSizeGuidesForCategories } from '@/lib/size-guides'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getProduct(slug: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select(`
      *,
      variants:product_variants(*),
      categories:product_categories(
        category:categories(*)
      ),
      reviews(
        *,
        user:users(id, full_name, avatar_url)
      )
    `)
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  return data
}

async function getRelatedProducts(categoryIds: string[], currentProductId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select(`
      *,
      variants:product_variants(*),
      categories:product_categories(category:categories(*))
    `)
    .eq('status', 'active')
    .in('product_categories.category_id', categoryIds)
    .neq('id', currentProductId)
    .limit(4)

  return data || []
}

async function getSizeOrder() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('product_sizes')
    .select('name')
    .order('display_order')
    .order('name')

  return (data || []).map((size) => size.name)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)

  if (!product) return { title: 'Product Not Found' }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL
  const image = product.images[0]?.url

  return {
    title: product.seo_title || product.name,
    description: product.seo_description || product.short_description || `Shop ${product.name} at Lfour37.`,
    keywords: product.seo_keywords || [],
    openGraph: {
      title: product.name,
      description: product.short_description || '',
      type: 'website',
      url: `${APP_URL}/products/${slug}`,
      images: image ? [{ url: image, alt: product.name }] : [],
    },
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params
  const product = await getProduct(slug)

  if (!product) notFound()

  const categoryIds = product.categories?.map((pc: { category: { id: string } }) => pc.category.id) || []
  const [relatedProducts, sizeOrder, sizeGuides] = await Promise.all([
    getRelatedProducts(categoryIds, product.id),
    getSizeOrder(),
    getSizeGuidesForCategories(categoryIds),
  ])

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images.map((img: { url: string }) => img.url),
    sku: product.sku,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'USD',
      availability: product.variants?.some((v: { stock: number }) => v.stock > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${process.env.NEXT_PUBLIC_APP_URL}/products/${slug}`,
    },
    aggregateRating:
      product.review_count > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: product.average_rating,
            reviewCount: product.review_count,
          }
        : undefined,
  }

  const reviews = (product.reviews || []).filter((r: { status: string }) => r.status === 'approved')

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <a href="/" className="hover:text-purple-600">Home</a>
          <span>/</span>
          <a href="/products" className="hover:text-purple-600">Products</a>
          {product.categories?.[0]?.category && (
            <>
              <span>/</span>
              <a
                href={`/products?category=${product.categories[0].category.slug}`}
                className="hover:text-purple-600"
              >
                {product.categories[0].category.name}
              </a>
            </>
          )}
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-xs">{product.name}</span>
        </nav>

        {/* Main product section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          <ProductGallery images={product.images} productName={product.name} />
          <ProductInfo product={product} sizeOrder={sizeOrder} sizeGuides={sizeGuides} />
        </div>

        {sizeGuides.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Size Guide</h2>
            <SizeGuideList guides={sizeGuides} />
          </section>
        )}

        {/* Reviews */}
        <ProductReviews
          productId={product.id}
          reviews={reviews}
          averageRating={product.average_rating}
          reviewCount={product.review_count}
        />

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <ProductSection
              title="You May Also Like"
              products={relatedProducts}
            />
          </div>
        )}
      </div>
    </>
  )
}
