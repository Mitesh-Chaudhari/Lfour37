/** Tiny gray JPEG used as a universal blur placeholder for remote images */
export const IMAGE_BLUR_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k='

export const DEFAULT_IMAGE_QUALITY = 75

/** Shown while product photos load (3:4 portrait — matches product card aspect) */
export const DEFAULT_PRODUCT_IMAGE = '/images/default-image.png'

export const IMAGE_SIZE_PRESETS = {
  thumbnail: '64px',
  cart: '96px',
  cartDrawer: '64px',
  card: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  gallery: '(max-width: 768px) 100vw, 50vw',
  galleryThumb: '80px',
  hero: '100vw',
  heroMobile: '100vw',
  category: '(max-width: 768px) 50vw, 25vw',
  categoryFeatured: '(max-width: 768px) 100vw, 50vw',
  avatar: '40px',
  logo: '120px',
  order: '48px',
  adminThumb: '48px',
} as const

export type OptimizedImageVariant = keyof typeof IMAGE_SIZE_PRESETS

type SupabaseResizeMode = 'cover' | 'contain' | 'fill'

interface SupabaseImageTransform {
  width: number
  height?: number
  quality?: number
  resize?: SupabaseResizeMode
}

const SUPABASE_TRANSFORM_PARAMS = ['width', 'height', 'quality', 'resize', 'format']

const SUPABASE_IMAGE_TRANSFORMS: Record<
  OptimizedImageVariant | 'default',
  SupabaseImageTransform
> = {
  thumbnail: { width: 128, height: 128, quality: 70, resize: 'cover' },
  cart: { width: 192, height: 192, quality: 70, resize: 'cover' },
  cartDrawer: { width: 128, height: 128, quality: 70, resize: 'cover' },
  card: { width: 640, height: 854, quality: 72, resize: 'cover' },
  gallery: { width: 1600, quality: 75 },
  galleryThumb: { width: 160, height: 200, quality: 68, resize: 'cover' },
  hero: { width: 1920, quality: 75 },
  heroMobile: { width: 900, quality: 72 },
  category: { width: 700, height: 700, quality: 72, resize: 'cover' },
  categoryFeatured: { width: 1200, quality: 74 },
  avatar: { width: 96, height: 96, quality: 70, resize: 'cover' },
  logo: { width: 240, quality: 80 },
  order: { width: 96, height: 96, quality: 70, resize: 'cover' },
  adminThumb: { width: 96, height: 96, quality: 70, resize: 'cover' },
  default: { width: 1200, quality: DEFAULT_IMAGE_QUALITY },
}

export function isSupabaseImageTransformsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS !== 'false'
}

export function isOptimizableImageSrc(src?: string | null): src is string {
  if (!src || typeof src !== 'string') return false
  const trimmed = src.trim()
  if (!trimmed) return false
  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  )
}

function getSupabasePublicImagePath(src: string) {
  try {
    const url = new URL(src)
    if (!url.hostname.endsWith('.supabase.co')) return null

    const parts = url.pathname.split('/').filter(Boolean)
    const storageIndex = parts.findIndex((part) => part === 'storage')
    if (storageIndex === -1) return null

    const publicIndex = parts.findIndex(
      (part, index) => index > storageIndex && part === 'public'
    )
    if (publicIndex === -1 || parts.length <= publicIndex + 2) return null

    const bucket = parts[publicIndex + 1]
    const objectPath = parts.slice(publicIndex + 2).join('/')

    if (!bucket || !objectPath) return null

    return { url, bucket, objectPath }
  } catch {
    return null
  }
}

export function getSupabaseTransformedImageSrc(
  src?: string | null,
  variant?: OptimizedImageVariant,
  quality = DEFAULT_IMAGE_QUALITY
): string | null {
  if (!isSupabaseImageTransformsEnabled()) return null
  if (!src || typeof src !== 'string') return null

  const parsed = getSupabasePublicImagePath(src)
  if (!parsed) return null

  const transform = { ...SUPABASE_IMAGE_TRANSFORMS[variant ?? 'default'] }
  if (quality !== DEFAULT_IMAGE_QUALITY) {
    transform.quality = quality
  }

  const params = new URLSearchParams(parsed.url.search)
  SUPABASE_TRANSFORM_PARAMS.forEach((param) => params.delete(param))
  params.set('width', String(transform.width))
  if (transform.height) params.set('height', String(transform.height))
  if (transform.resize) params.set('resize', transform.resize)
  if (transform.quality) params.set('quality', String(transform.quality))

  const query = params.toString()

  return `${parsed.url.origin}/storage/v1/render/image/public/${parsed.bucket}/${parsed.objectPath}${
    query ? `?${query}` : ''
  }`
}

/** Remote CDN images — skip Vercel /_next/image to avoid transformation quota limits */
export function shouldUseUnoptimizedImage(src?: string | null): boolean {
  if (!src || typeof src !== 'string') return false
  const trimmed = src.trim()
  if (!trimmed) return false

  if (process.env.NEXT_PUBLIC_UNOPTIMIZED_IMAGES === 'true') return true

  try {
    const { hostname, pathname } = new URL(trimmed)
    if (hostname.endsWith('.supabase.co') && pathname.includes('/storage/')) {
      return true
    }
  } catch {
    return false
  }

  return false
}
