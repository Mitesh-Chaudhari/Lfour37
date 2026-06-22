import { createAdminClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import logger from '@/lib/logger'

export type UserProfileInput = {
  user_id: string
  email: string
  full_name?: string | null
  phone?: string | null
  phone_verified?: boolean
  gender?: string | null
  dob?: string | null
  avatar_url?: string | null
  email_verified?: boolean
}

export async function getAuthUserByEmail(
  email: string
): Promise<User | null> {
  const supabase = createAdminClient()
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (error) {
    logger.warn('Failed to list auth users while checking email', { error })
    return null
  }

  return (
    data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    ) ?? null
  )
}

export async function getAuthUserById(userId: string): Promise<User | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.auth.admin.getUserById(userId)

  if (error) {
    logger.warn('Failed to fetch auth user by id', { error, userId })
    return null
  }

  return data.user
}

export async function syncUserProfile(
  input: UserProfileInput
): Promise<void> {
  const authUser = await getAuthUserById(input.user_id)

  if (!authUser) {
    throw new Error('Auth user not found')
  }

  const authEmail = authUser.email?.trim().toLowerCase()
  const inputEmail = input.email.trim().toLowerCase()

  if (!authEmail || authEmail !== inputEmail) {
    throw new Error('Email does not match auth user')
  }

  const metadata = authUser.user_metadata ?? {}
  const fullName =
    input.full_name ??
    (typeof metadata.full_name === 'string' ? metadata.full_name : null)
  const phone =
    input.phone ??
    (typeof metadata.phone === 'string' ? metadata.phone : null)
  const gender =
    input.gender ??
    (typeof metadata.gender === 'string' ? metadata.gender : null)
  const dob =
    input.dob ?? (typeof metadata.dob === 'string' ? metadata.dob : null)
  const avatarUrl =
    input.avatar_url ??
    (typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null)
  const phoneVerified =
    input.phone_verified ??
    metadata.phone_verified === true
  const emailVerified =
    input.email_verified ??
    authUser.email_confirmed_at != null

  const supabase = createAdminClient()
  const { error } = await supabase.from('users').upsert(
    {
      id: input.user_id,
      email: authEmail,
      full_name: fullName,
      avatar_url: avatarUrl,
      phone,
      phone_verified: phoneVerified,
      phone_verified_at: phoneVerified ? new Date().toISOString() : null,
      gender,
      dob,
      email_verified: emailVerified,
    },
    { onConflict: 'id' }
  )

  if (error) {
    throw error
  }
}
