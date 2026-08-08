import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthUserByEmail } from '@/lib/auth-users'
import logger from '@/lib/logger'

export type MintedSession = {
  access_token: string
  refresh_token: string
  user_id: string
}

type EmailOtpType = 'magiclink' | 'email'

function anonAuthClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

/**
 * Mint session tokens for an existing auth user without changing their password.
 * Uses an admin-generated magic link exchanged via verifyOtp (no email is sent).
 * Used by guest-reclaim so returning shoppers keep their existing credentials.
 */
export async function mintSessionForEmail(
  email: string
): Promise<MintedSession> {
  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createAdminClient()
  const authClient = anonAuthClient()

  const authUser = await getAuthUserByEmail(normalizedEmail)
  if (!authUser) {
    throw new Error('Auth user not found for session mint')
  }

  // Ensure sign-in works even if Supabase "Confirm email" is enabled.
  // Does not change password or other credentials.
  if (!authUser.email_confirmed_at) {
    const { error: confirmError } = await supabase.auth.admin.updateUserById(
      authUser.id,
      { email_confirm: true }
    )
    if (confirmError) {
      logger.error('mintSession: failed to confirm email', {
        confirmError,
        userId: authUser.id,
      })
      throw new Error(confirmError.message || 'Could not prepare sign-in')
    }
  }

  // `email` is the current docs default for token_hash; `magiclink` covers
  // older GoTrue type matching. Fresh link each attempt (OTP is single-use).
  const typeAttempts: EmailOtpType[] = ['email', 'magiclink']
  let lastError: { message?: string } | null = null

  for (const type of typeAttempts) {
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
      })

    if (linkError) {
      logger.error('mintSession: generateLink failed', {
        linkError,
        email: normalizedEmail,
        type,
      })
      lastError = linkError
      continue
    }

    const hashedToken = linkData.properties?.hashed_token
    const emailOtp = linkData.properties?.email_otp

    if (!hashedToken && !emailOtp) {
      lastError = { message: 'Could not prepare sign-in' }
      continue
    }

    const verifyResult = hashedToken
      ? await authClient.auth.verifyOtp({
          token_hash: hashedToken,
          type,
        })
      : await authClient.auth.verifyOtp({
          email: normalizedEmail,
          token: emailOtp!,
          type,
        })

    if (!verifyResult.error && verifyResult.data.session) {
      return {
        access_token: verifyResult.data.session.access_token,
        refresh_token: verifyResult.data.session.refresh_token,
        user_id: authUser.id,
      }
    }

    lastError = verifyResult.error
  }

  logger.error('mintSession: verifyOtp failed', {
    verifyError: lastError,
    email: normalizedEmail,
  })
  throw new Error(lastError?.message || 'Automatic sign-in failed')
}

/** Mint session using a known password (e.g. right after createUser). */
export async function mintSessionWithPassword(
  email: string,
  password: string,
  userId: string
): Promise<MintedSession> {
  const normalizedEmail = email.trim().toLowerCase()

  const { data: signInData, error: signInError } =
    await anonAuthClient().auth.signInWithPassword({
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
