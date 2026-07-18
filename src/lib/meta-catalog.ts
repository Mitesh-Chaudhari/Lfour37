import { normalizeProductImages } from '@/lib/product-images'
import { getCategoryPathLabel, type CategoryRef } from '@/lib/categories'

export const META_CATALOG_CURRENCY = 'INR'

export function getCatalogBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || 'https://www.lfour37.com'
  return raw.replace(/\/+$/, '')
}

export function getCatalogBrand(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || 'Lfour37'
}

interface CatalogVariant {
  stock: number | null
  is_active: boolean | null
  size: string | null
  color: string | null
}

interface CatalogCategoryJoin {
  category: CategoryRef | null
}

export interface CatalogProduct {
  id: string
  name: string
  slug: string
  description: string | null
  short_description: string | null
  price: number
  compare_price: number | null
  sku: string | null
  barcode: string | null
  images: unknown
  variants?: CatalogVariant[] | null
  categories?: CatalogCategoryJoin[] | null
}

const CSV_COLUMNS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'sale_price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'product_type',
  'item_group_id',
  'color',
  'size',
] as const

function formatMoney(amount: number): string {
  return `${Number(amount).toFixed(2)} ${META_CATALOG_CURRENCY}`
}

/** Meta allows basic text; strip HTML tags and collapse whitespace, cap length. */
function toPlainText(value: string | null | undefined, maxLength = 5000): string {
  if (!value) return ''
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function isProductInStock(variants?: CatalogVariant[] | null): boolean {
  return (variants || []).some(
    (variant) => variant.is_active !== false && (variant.stock ?? 0) > 0
  )
}

function getUniqueVariantValues(
  variants: CatalogVariant[] | null | undefined,
  key: 'size' | 'color'
): string {
  const values = new Set<string>()
  for (const variant of variants || []) {
    if (variant.is_active === false) continue
    const value = variant[key]?.trim()
    if (value) values.add(value)
  }
  return [...values].join(',')
}

export interface CatalogRow {
  id: string
  title: string
  description: string
  availability: string
  condition: string
  price: string
  sale_price: string
  link: string
  image_link: string
  additional_image_link: string
  brand: string
  product_type: string
  item_group_id: string
  color: string
  size: string
}

/** Build a single catalog row, or null if the product cannot form a valid feed entry. */
export function buildCatalogRow(
  product: CatalogProduct,
  allCategories: CategoryRef[]
): CatalogRow | null {
  if (!product.id || !product.slug || !product.name) return null
  // Exclude out-of-stock products entirely (do not advertise unavailable items).
  if (!isProductInStock(product.variants)) return null

  const images = normalizeProductImages(product.images)
  const primaryImage = images[0]?.url
  if (!primaryImage) return null

  const baseUrl = getCatalogBaseUrl()

  const hasSale =
    product.compare_price != null && product.compare_price > product.price
  const regularPrice = hasSale ? product.compare_price! : product.price
  const salePrice = hasSale ? product.price : null

  const categoryIds = (product.categories || [])
    .map((join) => join.category?.id)
    .filter((id): id is string => Boolean(id))

  const productType = categoryIds.length
    ? getCategoryPathLabel(categoryIds[0], allCategories)
    : ''

  const additionalImages = images
    .slice(1, 11)
    .map((image) => image.url)
    .join(',')

  // Only in-stock variants contribute to color/size columns.
  const inStockVariants = (product.variants || []).filter(
    (variant) => variant.is_active !== false && (variant.stock ?? 0) > 0
  )

  return {
    id: product.id,
    title: toPlainText(product.name, 200),
    description:
      toPlainText(product.short_description) ||
      toPlainText(product.description) ||
      toPlainText(product.name, 200),
    availability: 'in stock',
    condition: 'new',
    price: formatMoney(regularPrice),
    sale_price: salePrice != null ? formatMoney(salePrice) : '',
    link: `${baseUrl}/products/${product.slug}`,
    image_link: primaryImage,
    additional_image_link: additionalImages,
    brand: getCatalogBrand(),
    product_type: productType,
    item_group_id: product.id,
    color: getUniqueVariantValues(inStockVariants, 'color'),
    size: getUniqueVariantValues(inStockVariants, 'size'),
  }
}

export function buildCatalogCsv(rows: CatalogRow[]): string {
  const header = CSV_COLUMNS.join(',')
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((column) => csvEscape(row[column] ?? '')).join(',')
  )
  return [header, ...lines].join('\n')
}

/**
 * Validates the incoming request's feed secret.
 * - If META_CATALOG_FEED_SECRET is set, the request must supply a matching `?token=`.
 * - If it is not set, the feed is public (not recommended for production).
 */
export function isCatalogRequestAuthorized(token: string | null): boolean {
  const secret = process.env.META_CATALOG_FEED_SECRET
  if (!secret) return true
  return token === secret
}

export function isCatalogFeedSecretConfigured(): boolean {
  return Boolean(process.env.META_CATALOG_FEED_SECRET)
}
