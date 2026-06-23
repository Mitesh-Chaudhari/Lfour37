import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const profileUpdateSchema = z.object({
  full_name: z.string().min(2).max(100),
  phone: z
    .string()
    .regex(/^[0-9]{10}$/, 'Phone number must be exactly 10 digits')
    .optional()
    .nullable(),
  newsletter_subscribed: z.boolean().optional(),
})

async function isPhoneVerified(phone: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('verified_phones')
    .select('phone')
    .eq('phone', phone)
    .maybeSingle()

  return Boolean(data)
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = profileUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      )
    }

    const { full_name, phone, newsletter_subscribed } = parsed.data

    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('phone, phone_verified')
      .eq('id', user.id)
      .single()

    if (fetchError) {
      logger.error('Failed to load user profile for update', { error: fetchError })
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
    }

    const currentPhone = currentUser?.phone ?? ''
    const normalizedPhone = phone?.trim() || ''
    const phoneChanged = normalizedPhone !== currentPhone

    if (normalizedPhone) {
      const needsVerification =
        phoneChanged || !currentUser?.phone_verified

      if (needsVerification) {
        const verified = await isPhoneVerified(normalizedPhone)
        if (!verified) {
          return NextResponse.json(
            { error: 'Please verify your phone number before saving' },
            { status: 400 }
          )
        }
      }
    }

    const updatePayload: Record<string, unknown> = {
      full_name,
      newsletter_subscribed: newsletter_subscribed ?? false,
      phone: normalizedPhone || null,
    }

    if (normalizedPhone) {
      if (phoneChanged || !currentUser?.phone_verified) {
        updatePayload.phone_verified = true
        updatePayload.phone_verified_at = new Date().toISOString()
      }
    } else {
      updatePayload.phone_verified = false
      updatePayload.phone_verified_at = null
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', user.id)

    if (updateError) {
      logger.error('Profile update failed', { error: updateError, userId: user.id })
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    const admin = createAdminClient()
    const metadata = user.user_metadata ?? {}
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...metadata,
        full_name,
        phone: normalizedPhone || null,
        phone_verified: Boolean(normalizedPhone && updatePayload.phone_verified),
      },
    })

    return NextResponse.json({
      success: true,
      phone: normalizedPhone || null,
      phone_verified: Boolean(updatePayload.phone_verified),
    })
  } catch (error) {
    logger.error('Profile update route failed', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
