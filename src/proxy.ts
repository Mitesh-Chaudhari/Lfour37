import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  canAccessPath,
  firstAllowedPath,
  isStaffRole,
} from '@/lib/admin-permissions'

const protectedRoutes = ['/dashboard']
const adminRoutes = ['/admin']
const authRoutes = ['/login', '/register', '/forgot-password']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtectedRoute = protectedRoutes.some((r) => pathname.startsWith(r))
  const isAdminRoute = adminRoutes.some((r) => pathname.startsWith(r))
  const isAuthRoute = authRoutes.some((r) => pathname.startsWith(r))

  if (!user && (isProtectedRoute || isAdminRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    const response = NextResponse.redirect(url)
    response.cookies.set('auth_redirect', pathname, {
      path: '/',
      maxAge: 60 * 10,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    })
    return response
  }

  if (user && isAuthRoute) {
    const redirectTo = request.nextUrl.searchParams.get('redirectTo')
    const safePath =
      redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
        ? redirectTo
        : '/'

    const url = request.nextUrl.clone()
    url.pathname = safePath
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (user && isAdminRoute) {
    const { data: userData } = await supabase
      .from('users')
      .select('role, is_suspended')
      .eq('id', user.id)
      .single()

    if (!userData || !isStaffRole(userData.role) || userData.is_suspended) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    if (!canAccessPath(userData.role, pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = firstAllowedPath(userData.role)
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  if (pathname.startsWith('/api/')) {
    supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff')
    supabaseResponse.headers.set('X-Frame-Options', 'DENY')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|site.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
