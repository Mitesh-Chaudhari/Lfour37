'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User } from '@/types'
import toast from 'react-hot-toast'
import { BlockingContainer } from '@/components/ui/blocking-container'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name is required').max(100),
  phone: z
    .string()
    .regex(/^[0-9]{10}$/, 'Phone number must be exactly 10 digits')
    .optional()
    .or(z.literal('')),
  newsletter_subscribed: z.boolean().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

type ProfileUser = User & {
  phone_verified?: boolean
}

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [savedPhone, setSavedPhone] = useState('')
  const [savedPhoneVerified, setSavedPhoneVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [isSendOtpClicked, setIsSendOtpClicked] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema) as any,
  })

  const phone = watch('phone') || ''
  const isValidPhone = /^[0-9]{10}$/.test(phone)
  const phoneChanged = phone !== savedPhone
  const needsPhoneVerification =
    Boolean(phone) && (phoneChanged || !savedPhoneVerified)

  const checkPhoneVerification = useCallback(async (phoneNumber: string) => {
    try {
      const res = await fetch('/api/auth/check-phone-verified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber }),
      })
      const data = await res.json()

      if (data.verified) {
        setPhoneVerified(true)
        setVerifiedPhone(phoneNumber)
        setIsSendOtpClicked(false)
      }
    } catch {
      // Ignore lookup failures; user can verify manually.
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) return

      const { data } = await supabase
        .from('users')
        .select('id, email, full_name, phone, phone_verified, newsletter_subscribed, role, is_suspended, email_verified, avatar_url, created_at, updated_at')
        .eq('id', authUser.id)
        .single()

      const metadataPhone =
        typeof authUser.user_metadata?.phone === 'string'
          ? authUser.user_metadata.phone
          : ''
      const metadataPhoneVerified =
        authUser.user_metadata?.phone_verified === true

      const profilePhone = data?.phone || metadataPhone || ''
      const profilePhoneVerified =
        data?.phone_verified === true ||
        (Boolean(profilePhone) && metadataPhoneVerified)

      if (data) {
        const profileUser = {
          ...data,
          phone: profilePhone,
          phone_verified: profilePhoneVerified,
        }
        setUser(profileUser)
        setSavedPhone(profilePhone)
        setSavedPhoneVerified(profilePhoneVerified)
        reset({
          full_name: data.full_name || '',
          phone: profilePhone,
          newsletter_subscribed: data.newsletter_subscribed,
        })

        if (profilePhone && profilePhoneVerified) {
          setPhoneVerified(true)
          setVerifiedPhone(profilePhone)
        } else if (profilePhone.length === 10) {
          await checkPhoneVerification(profilePhone)
        }
      }

      setIsLoading(false)
    }
    load()
  }, [checkPhoneVerification, reset, supabase])

  useEffect(() => {
    if (!phone) {
      setPhoneVerified(false)
      setVerifiedPhone('')
      setIsSendOtpClicked(false)
      return
    }

    if (verifiedPhone && verifiedPhone !== phone) {
      setPhoneVerified(false)
      setVerifiedPhone('')
      setIsSendOtpClicked(false)
    }

    if (phone.length === 10 && phone !== savedPhone) {
      checkPhoneVerification(phone)
    } else if (phone === savedPhone && savedPhoneVerified) {
      setPhoneVerified(true)
      setVerifiedPhone(phone)
    }
  }, [phone, savedPhone, savedPhoneVerified, verifiedPhone, checkPhoneVerification])

  const sendOtp = async () => {
    if (!isValidPhone) {
      toast.error('Please enter a valid 10 digit phone number')
      return
    }

    setSendingOtp(true)
    try {
      const res = await fetch('/api/auth/send-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to send OTP')
        return
      }

      setIsSendOtpClicked(true)
      toast.success('OTP sent on WhatsApp')
    } catch {
      toast.error('Failed to send OTP')
    } finally {
      setSendingOtp(false)
    }
  }

  const verifyOtp = async () => {
    if (!otp) {
      toast.error('Enter OTP')
      return
    }

    setVerifyingOtp(true)
    try {
      const res = await fetch('/api/auth/verify-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Invalid OTP')
        return
      }

      setPhoneVerified(true)
      setVerifiedPhone(phone)
      setOtp('')
      toast.success('Phone verified')
    } catch {
      toast.error('Verification failed')
    } finally {
      setVerifyingOtp(false)
    }
  }

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return

    const normalizedPhone = data.phone?.trim() || ''

    if (normalizedPhone) {
      if (needsPhoneVerification) {
        if (!phoneVerified || verifiedPhone !== normalizedPhone) {
          toast.error('Please verify your phone number before saving')
          return
        }
      }
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.full_name,
          phone: normalizedPhone || null,
          newsletter_subscribed: data.newsletter_subscribed,
        }),
      })

      const result = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(result?.error || 'Failed to update profile')
        return
      }

      setSavedPhone(normalizedPhone)
      setSavedPhoneVerified(Boolean(result?.phone_verified))
      if (normalizedPhone && result?.phone_verified) {
        setPhoneVerified(true)
        setVerifiedPhone(normalizedPhone)
      }

      toast.success('Profile updated successfully!')
    } catch {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4 max-w-xl">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <BlockingContainer
      busy={isSaving || isSendingReset || sendingOtp || verifyingOtp}
      message={
        isSaving
          ? 'Saving profile...'
          : sendingOtp
            ? 'Sending OTP...'
            : verifyingOtp
              ? 'Verifying OTP...'
              : 'Sending reset email...'
      }
      className="container mx-auto px-4 py-8 max-w-xl"
    >
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Profile Settings</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Full Name"
            error={errors.full_name?.message}
            {...register('full_name')}
          />

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="flex h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
          </div>

          <div>
            <Input
              label="Phone Number"
              type="tel"
              placeholder="9876543210"
              maxLength={10}
              error={errors.phone?.message}
              leftIcon={
                <span className="text-sm font-medium text-gray-500 select-none">+91</span>
              }
              className="pl-[2.25rem]"
              {...register('phone', {
                onChange: (e) => {
                  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10)
                },
              })}
            />
            {phone && !isValidPhone && (
              <p className="text-xs text-red-500 mt-1">
                Enter a valid 10 digit mobile number
              </p>
            )}

            <div className="space-y-2 mt-2">
              {isValidPhone && needsPhoneVerification && !phoneVerified && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={sendOtp}
                  loading={sendingOtp}
                  disabled={!isValidPhone}
                >
                  Send OTP
                </Button>
              )}

              {isValidPhone && needsPhoneVerification && !phoneVerified && isSendOtpClicked && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={otp}
                    maxLength={6}
                    placeholder="Enter OTP"
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  />
                  <Button type="button" onClick={verifyOtp} loading={verifyingOtp}>
                    Verify
                  </Button>
                </div>
              )}

              {phone && phoneVerified && verifiedPhone === phone && (
                <p className="text-green-600 text-sm">✓ Phone number verified</p>
              )}

              {savedPhone && !phoneChanged && savedPhoneVerified && (
                <p className="text-xs text-gray-500">
                  Current verified number: +91 {savedPhone}
                </p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary-600"
              {...register('newsletter_subscribed')}
            />
            <span className="text-sm text-gray-700">Subscribe to newsletter</span>
          </label>

          <Button
            type="submit"
            loading={isSaving}
            className="w-full"
            disabled={needsPhoneVerification && !phoneVerified}
          >
            Save Changes
          </Button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        <p className="text-sm text-gray-600 mb-4">
          We&apos;ll send a password reset link to your email address.
        </p>
        <Button
          variant="outline"
          loading={isSendingReset}
          onClick={async () => {
            if (!user) return
            setIsSendingReset(true)
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: `${window.location.origin}/reset-password`,
              })
              if (!error) toast.success('Password reset email sent!')
              else toast.error(error.message)
            } finally {
              setIsSendingReset(false)
            }
          }}
        >
          Send Reset Email
        </Button>
      </div>
    </BlockingContainer>
  )
}
