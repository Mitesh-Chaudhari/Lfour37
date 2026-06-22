import type { ProductImage } from '@/types'

export function getProductPrimaryImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null

  const first = images[0]
  if (typeof first === 'string' && first.trim()) return first
  if (first && typeof first === 'object' && 'url' in first) {
    const url = (first as ProductImage).url
    if (typeof url === 'string' && url.trim()) return url
  }

  return null
}

type VariantImageSource = {
  image_url?: string | null
  is_active?: boolean
}

type ProductImageSource = {
  images?: unknown
  variants?: VariantImageSource[] | null
}

export function getProductPreviewImageUrl(product: ProductImageSource): string | null {
  const fromGallery = getProductPrimaryImageUrl(product.images)
  if (fromGallery) return fromGallery

  const variantImage = product.variants?.find(
    (variant) => variant.is_active !== false && variant.image_url?.trim()
  )?.image_url

  return variantImage?.trim() || null
}

type RankableProduct = ProductImageSource & {
  is_featured?: boolean
  created_at?: string
}

export function pickBestCategoryProduct<T extends RankableProduct>(
  products: T[]
): T | null {
  if (products.length === 0) return null

  return [...products].sort((a, b) => {
    const featuredDiff = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured))
    if (featuredDiff !== 0) return featuredDiff

    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })[0]
}

export function buildCategoryPreviewMap(
  rows: Array<{
    category_id: string
    products: RankableProduct | RankableProduct[] | null
  }>,
  categories: Array<{ id: string; image_url?: string | null; parent_id?: string | null }>
): Record<string, string> {
  const productsByCategory: Record<string, RankableProduct[]> = {}

  for (const row of rows) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    if (!product) continue

    if (!productsByCategory[row.category_id]) {
      productsByCategory[row.category_id] = []
    }
    productsByCategory[row.category_id].push(product)
  }

  const previews: Record<string, string> = {}

  for (const category of categories) {
    const bestProduct = pickBestCategoryProduct(productsByCategory[category.id] || [])
    const productImage = bestProduct
      ? getProductPreviewImageUrl(bestProduct)
      : null

    if (productImage) {
      previews[category.id] = productImage
      continue
    }

    if (category.image_url?.trim()) {
      previews[category.id] = category.image_url.trim()
    }
  }

  // Section/parent categories without their own product: use a child category image
  const childrenByParent = new Map<string, string[]>()
  for (const category of categories) {
    if (!category.parent_id) continue
    const siblings = childrenByParent.get(category.parent_id) || []
    siblings.push(category.id)
    childrenByParent.set(category.parent_id, siblings)
  }

  for (const category of categories) {
    if (previews[category.id]) continue

    const childIds = childrenByParent.get(category.id) || []
    for (const childId of childIds) {
      if (previews[childId]) {
        previews[category.id] = previews[childId]
        break
      }
    }
  }

  return previews
}
