import { NextRequest, NextResponse } from 'next/server'
import { syncUserProfile } from '@/lib/auth-users'
import { getSafeRedirectPath } from '@/lib/auth-redirect'
import { createClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = getSafeRedirectPath(
    requestUrl.searchParams.get('next') ||
      requestUrl.searchParams.get('redirectTo')
  )

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user?.id && data.user.email) {
      try {
        await syncUserProfile({
          user_id: data.user.id,
          email: data.user.email,
          email_verified: data.user.email_confirmed_at != null,
        })
      } catch (syncError) {
        logger.warn('Failed to sync user profile after auth callback', {
          syncError,
          userId: data.user.id,
        })
      }
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}${next}`, {
    headers: {
      'Set-Cookie': 'auth_redirect=; Path=/; Max-Age=0',
    },
  })
}
