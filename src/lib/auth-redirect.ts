const AUTH_REDIRECT_KEY = 'auth_redirect'

/** Only allow same-origin relative paths (blocks open redirects). */
export function getSafeRedirectPath(
  path: string | null | undefined,
  fallback = '/'
): string {
  if (!path) return fallback
  if (!path.startsWith('/') || path.startsWith('//')) return fallback
  return path
}

export function persistAuthRedirect(path: string) {
  if (typeof window === 'undefined') return
  const safe = getSafeRedirectPath(path, '')
  if (!safe) return
  sessionStorage.setItem(AUTH_REDIRECT_KEY, safe)
}

export function readAuthRedirect(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(AUTH_REDIRECT_KEY)
}

export function clearAuthRedirect() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(AUTH_REDIRECT_KEY)
}

export function buildAuthHref(
  basePath: '/login' | '/register',
  returnPath?: string | null
): string {
  const safe = getSafeRedirectPath(returnPath, '')
  if (!safe || safe === '/login' || safe === '/register') return basePath
  return `${basePath}?redirectTo=${encodeURIComponent(safe)}`
}

export function readAuthRedirectCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|; )auth_redirect=([^;]*)/)
  if (!match?.[1]) return null
  return getSafeRedirectPath(decodeURIComponent(match[1]), '')
}

export function clearAuthRedirectCookie() {
  if (typeof document === 'undefined') return
  document.cookie = 'auth_redirect=; path=/; max-age=0'
}

export function resolveAuthRedirect(
  queryValue: string | null | undefined,
  fallback = '/'
): string {
  const fromQuery = getSafeRedirectPath(queryValue, '')
  if (fromQuery) return fromQuery

  const fromCookie = readAuthRedirectCookie()
  if (fromCookie) return fromCookie

  const fromStorage = getSafeRedirectPath(readAuthRedirect(), '')
  if (fromStorage) return fromStorage

  return fallback
}
