import { randomBytes } from 'crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthUserByEmail } from '@/lib/auth-users'
import logger from '@/lib/logger'

export type MintedSession = {
  access_token: string
  refresh_token: string
  user_id: string
}

/**
 * Rotate a temporary password and return session tokens for an existing auth user.
 * Used by guest-checkout (new accounts) and guest-reclaim (existing accounts).
 */
export async function mintSessionForEmail(
  email: string
): Promise<MintedSession> {
  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createAdminClient()

  const authUser = await getAuthUserByEmail(normalizedEmail)
  if (!authUser) {
    throw new Error('Auth user not found for session mint')
  }

  const password = randomBytes(24).toString('base64url')

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    authUser.id,
    {
      password,
      email_confirm: true,
    }
  )

  if (updateError) {
    logger.error('mintSession: failed to set temporary password', {
      updateError,
      userId: authUser.id,
    })
    throw new Error(updateError.message || 'Could not prepare sign-in')
  }

  const { data: signInData, error: signInError } = await createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  ).auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (signInError || !signInData.session) {
    logger.error('mintSession: signInWithPassword failed', {
      signInError,
      email: normalizedEmail,
    })
    throw new Error(signInError?.message || 'Automatic sign-in failed')
  }

  return {
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
    user_id: authUser.id,
  }
}

/** Mint session using a known password (e.g. right after createUser). */
export async function mintSessionWithPassword(
  email: string,
  password: string,
  userId: string
): Promise<MintedSession> {
  const normalizedEmail = email.trim().toLowerCase()

  const { data: signInData, error: signInError } = await createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  ).auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (signInError || !signInData.session) {
    logger.error('mintSessionWithPassword failed', {
      signInError,
      email: normalizedEmail,
    })
    throw new Error(signInError?.message || 'Automatic sign-in failed')
  }

  return {
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
    user_id: userId,
  }
}
