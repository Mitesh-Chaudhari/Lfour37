/** Tiny gray JPEG used as a universal blur placeholder for remote images */
export const IMAGE_BLUR_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k='

export const DEFAULT_IMAGE_QUALITY = 75

export const IMAGE_SIZE_PRESETS = {
  thumbnail: '64px',
  cart: '96px',
  cartDrawer: '64px',
  card: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  gallery: '(max-width: 768px) 100vw, 50vw',
  galleryThumb: '80px',
  hero: '100vw',
  category: '(max-width: 768px) 50vw, 25vw',
  categoryFeatured: '(max-width: 768px) 100vw, 50vw',
  avatar: '40px',
  logo: '120px',
  order: '48px',
  adminThumb: '48px',
} as const

export type OptimizedImageVariant = keyof typeof IMAGE_SIZE_PRESETS

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
