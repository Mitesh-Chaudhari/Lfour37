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

export type PublicUserProfile = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  phone_verified?: boolean | null
}

/** Mask phone for UI hints — last 4 digits only. */
export function phoneHint(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 4) return null
  return `******${digits.slice(-4)}`
}

/** Last 10 digits for Indian mobile comparison / form fields. */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

function asTenDigitPhone(phone: string | null | undefined): string | null {
  const digits = normalizePhoneDigits(phone)
  return digits.length === 10 ? digits : null
}

/**
 * Resolve the best phone for an account:
 * profile → auth metadata → saved addresses → latest order shipping phone.
 * Returns a 10-digit number when possible.
 */
export async function resolveAccountPhone(options: {
  userId: string
  profilePhone?: string | null
  authMetadataPhone?: string | null
}): Promise<string | null> {
  const fromProfile = asTenDigitPhone(options.profilePhone)
  if (fromProfile) return fromProfile

  const fromMeta = asTenDigitPhone(options.authMetadataPhone)
  if (fromMeta) return fromMeta

  const supabase = createAdminClient()
  const { data: addresses } = await supabase
    .from('addresses')
    .select('phone, is_default, created_at')
    .eq('user_id', options.userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)

  for (const addr of addresses || []) {
    const fromAddr = asTenDigitPhone(addr.phone)
    if (fromAddr) return fromAddr
  }

  const { data: recentOrders } = await supabase
    .from('orders')
    .select('shipping_address, created_at')
    .eq('user_id', options.userId)
    .order('created_at', { ascending: false })
    .limit(5)

  for (const order of recentOrders || []) {
    const shipping = order.shipping_address as { phone?: string } | null
    const fromOrder = asTenDigitPhone(shipping?.phone)
    if (fromOrder) return fromOrder
  }

  return null
}

/** Whether this phone is already marked verified for the account. */
export async function isAccountPhoneVerified(options: {
  userId: string
  phone: string
  profilePhoneVerified?: boolean | null
}): Promise<boolean> {
  if (options.profilePhoneVerified) return true

  const phone = asTenDigitPhone(options.phone)
  if (!phone) return false

  const supabase = createAdminClient()
  const candidates = [phone, `91${phone}`, `+91${phone}`]

  for (const candidate of candidates) {
    const { data } = await supabase
      .from('verified_phones')
      .select('phone')
      .eq('phone', candidate)
      .maybeSingle()
    if (data) return true
  }

  return false
}

export async function getPublicUserByEmail(
  email: string
): Promise<PublicUserProfile | null> {
  const supabase = createAdminClient()
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, phone, phone_verified')
    .eq('email', normalizedEmail)
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.warn('Failed to fetch public user by email', { error })
    return null
  }

  return data
}

/**
 * Look up auth user by email. Uses public.users id when present, else paginates
 * listUsers (this SDK build has no admin getUserByEmail).
 */
export async function getAuthUserByEmail(
  email: string
): Promise<User | null> {
  const supabase = createAdminClient()
  const normalizedEmail = email.trim().toLowerCase()

  const profile = await getPublicUserByEmail(normalizedEmail)
  if (profile?.id) {
    const byId = await getAuthUserById(profile.id)
    if (byId) return byId
  }

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) {
      logger.warn('Failed to list auth users while checking email', {
        error,
        page,
      })
      return null
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    )
    if (match) return match

    if (data.users.length < 1000) break
  }

  return null
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

/**
 * Marks the auth user as email-confirmed so they can sign in even when
 * Supabase Auth → "Confirm email" is enabled. Does not prove inbox ownership.
 */
export async function confirmAuthEmail(userId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    email_confirm: true,
  })

  if (error) {
    logger.error('Failed to auto-confirm auth email', { error, userId })
    throw new Error(error.message || 'Could not confirm email')
  }
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
    input.phone_verified ?? metadata.phone_verified === true
  const emailVerified =
    input.email_verified ?? authUser.email_confirmed_at != null

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
