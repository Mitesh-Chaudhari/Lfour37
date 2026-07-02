'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  useRouter,
  useSearchParams,
} from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  registerSchema,
  RegisterFormData,
} from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BlockingContainer } from '@/components/ui/blocking-container'
import {
  persistAuthRedirect,
  resolveAuthRedirect,
} from '@/lib/auth-redirect'
import toast from 'react-hot-toast'

export default function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = resolveAuthRedirect(searchParams.get('redirectTo'))
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [phoneVerified, setPhoneVerified] =
    useState(false)

  const [otp, setOtp] =
    useState('')

  const [sendingOtp, setSendingOtp] =
    useState(false)

  const [verifyingOtp, setVerifyingOtp] =
    useState(false)

  const [verifiedPhone, setVerifiedPhone] =
    useState('')
  const [isSendOTPCliked, setIsSendOTPCliked] =
    useState(false);
  const supabase = createClient()
  const [emailExists, setEmailExists] =
    useState(false)

  const [checkingEmail, setCheckingEmail] =
    useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema) as any,
  })

  const phone = watch('phone')
  const email = watch('email')
  const isValidPhone =
    /^[0-9]{10}$/.test(
      phone || ''
    )

  useEffect(() => {
    const queryRedirect = searchParams.get('redirectTo')
    if (queryRedirect) {
      persistAuthRedirect(queryRedirect)
    }
  }, [searchParams])

  useEffect(() => {

    if (!phone) return

    if (
      verifiedPhone &&
      verifiedPhone !== phone
    ) {
      setPhoneVerified(false)
      setVerifiedPhone('')
    }

    if (
      phone.length === 10
    ) {
      checkPhoneVerification(
        phone
      )
    }

  }, [phone])
  useEffect(() => {
    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email)
    ) {
      setEmailExists(false)
      return
    }

    const timeout =
      setTimeout(async () => {
        try {
          setCheckingEmail(true)
          const res =
            await fetch(
              '/api/auth/check-email',
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },
                body:
                  JSON.stringify({
                    email,
                  }),
              }
            )
          const data =
            await res.json()
          setEmailExists(
            data.exists
          )
        } catch {
          setEmailExists(false)
        } finally {
          setCheckingEmail(false)
        }
      }, 500)
    return () =>
      clearTimeout(timeout)
  }, [email])

  const onSubmit = async (data: RegisterFormData) => {
    if (emailExists) {
      toast.error(
        'This email is already registered'
      )
      return
    }
    if (!phoneVerified) {
      toast.error(
        'Please verify your phone number'
      )
      return
    }
    if (
      verifiedPhone !== data.phone
    ) {
      toast.error(
        'Phone number changed. Please verify again.'
      )

      return
    }
    setIsLoading(true)
    try {
        const { data: signUpData, error } =
        await supabase.auth.signUp({
            email: data.email,
            password:
            data.password,

            options: {
            data: {
                full_name:
                data.full_name,

                phone:
                data.phone,

                phone_verified: true,

                gender:
                data.gender || null,

                dob: data.dob || null,
            },

            emailRedirectTo:
                `${window.location.origin}/api/auth/callback`,
            },
        })

      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('An account with this email already exists')
        } else {
          toast.error(error.message)
        }
        return
      }

      if (signUpData.user?.id) {
        const profileRes = await fetch('/api/auth/complete-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: signUpData.user.id,
            email: data.email,
            full_name: data.full_name,
            phone: data.phone,
            phone_verified: true,
            gender: data.gender || null,
            dob: data.dob || null,
          }),
        })

        if (!profileRes.ok) {
          const profileError = await profileRes.json().catch(() => null)
          toast.error(
            profileError?.error ||
              'Account created but profile setup failed. Please contact support.'
          )
          return
        }
      }

      toast.success('Account created! Check your email to verify your account.')
      router.push(
        `/login?redirectTo=${encodeURIComponent(
          redirectTo
        )}`
      )
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    persistAuthRedirect(redirectTo)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })
    if (error) toast.error(error.message)
  }

  const sendOtp = async () => {
    if (!isValidPhone) {
      toast.error(
        'Please enter a valid 10 digit phone number'
      )
      return
    }
    if (!phone) {
      toast.error(
        'Enter phone number first'
      )
      return
    }
    setSendingOtp(true);

    try {

      const res =
        await fetch(
          '/api/auth/send-phone-otp',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              phone,
            }),
          }
        )

      const data =
        await res.json()

      if (!res.ok) {
        toast.error(
          data.error ||
          'Failed to send OTP'
        )
        return
      }
      setIsSendOTPCliked(true);
      toast.success(
        'OTP sent on WhatsApp'
      )

    } catch {
      toast.error(
        'Failed to send OTP'
      )
    } finally {
      setSendingOtp(false)
    }
  }

  const verifyOtp = async () => {
    if (!otp) {
      toast.error(
        'Enter OTP'
      )
      return
    }
    setVerifyingOtp(true)

    try {
      const res =
        await fetch(
          '/api/auth/verify-phone-otp',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              phone,
              otp,
            }),
          }
        )

      const data =
        await res.json()

      if (!res.ok) {
        toast.error(
          data.error ||
          'Invalid OTP'
        )
        return
      }

      setPhoneVerified(true)
      setVerifiedPhone(phone)
      toast.success(
        'Phone verified'
      )

    } catch {
      toast.error(
        'Verification failed'
      )
    } finally {
      setVerifyingOtp(false)
    }
  }

  const checkPhoneVerification =
    async (
      phoneNumber: string
    ) => {

      try {

        const res =
          await fetch(
            '/api/auth/check-phone-verified',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                phone: phoneNumber,
              }),
            }
          )

        const data =
          await res.json()

        if (
          data.verified &&
          !phoneVerified
        ) {
          setPhoneVerified(true)

          setVerifiedPhone(
            phoneNumber
          )

          setIsSendOTPCliked(
            false
          )

          toast.success(
            'Phone already verified'
          )
        }

      } catch (err) {

        console.error(err)

      }
  }

  return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="text-gray-500 mt-1">Join Lfour37 today</p>
          </div>

          {/* Google */}
          {/* <button
            onClick={handleGoogleSignUp}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-6"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button> */}

          {/* <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400">Or continue with email</span>
            </div>
          </div> */}

          <BlockingContainer
            busy={isLoading || sendingOtp || verifyingOtp}
            message={
              isLoading
                ? 'Creating your account...'
                : sendingOtp
                  ? 'Sending OTP...'
                  : 'Verifying OTP...'
            }
          >
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="John Doe"
              leftIcon={<User className="h-4 w-4" />}
              error={errors.full_name?.message}
              {...register('full_name')}
            />

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender (Optional)
                </label>

                <select
                    {...register('gender')}
                    className="
                    w-full
                    rounded-lg
                    border
                    border-gray-300
                    px-3
                    py-2
                    text-sm
                    focus:outline-none
                    focus:ring-2
                    focus:ring-purple-500
                    "
                >
                    <option value="">
                    Select Gender
                    </option>

                    <option value="male">
                    Male
                    </option>

                    <option value="female">
                    Female
                    </option>

                    <option value="other">
                    Other
                    </option>

                    <option value="prefer_not_to_say">
                    Prefer not to say
                    </option>
                </select>

                {errors.gender && (
                    <p className="mt-1 text-xs text-red-500">
                    {errors.gender.message}
                    </p>
                )}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth (Optional)
                </label>

                <input
                    type="date"
                    {...register('dob')}
                    max={
                    new Date()
                        .toISOString()
                        .split('T')[0]
                    }
                    className="
                    w-full
                    rounded-lg
                    border
                    border-gray-300
                    px-3
                    py-2
                    text-sm
                    focus:outline-none
                    focus:ring-2
                    focus:ring-purple-500
                    "
                />

                {errors.dob && (
                    <p className="mt-1 text-xs text-red-500">
                    {errors.dob.message}
                    </p>
                )}
                </div>

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              leftIcon={<Mail className="h-4 w-4" />}
              error={
                errors.email?.message ||
                (
                  emailExists
                    ? 'This email is already registered. Please use another email or sign in'
                    : undefined
                )
              }
              {...register('email')}
            />
            {checkingEmail && (
              <p className="text-xs text-gray-500">
                Checking email...
              </p>
            )}

            <Input
              label="Phone Number"
              type="tel"
              placeholder="9876543210"
              maxLength={10}
              helperText="Provide WhatsApp number to receive updates on WhatsApp."
              error={errors.phone?.message}
              leftIcon={
                <span className="text-sm font-medium text-gray-500 select-none">
                +91
                </span>
              }
              className="pl-[2.25rem]"

              {...register('phone', {
                onChange: (e) => {
                  e.target.value =
                    e.target.value
                      .replace(/\D/g, '')
                      .slice(0, 10)
                },
              })}
            />
            {phone &&
              !isValidPhone && (
                <p className="text-xs text-red-500">
                  Enter a valid 10 digit mobile number
                </p>
              )}
            <div className="space-y-2">
              {
                isValidPhone && !phoneVerified && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={sendOtp}
                    loading={sendingOtp}
                    disabled={
                      !isValidPhone ||
                      emailExists
                    }
                  >
                    {phoneVerified ? '✓ Verified' : 'Send OTP'}
                  </Button>
                )
              }

              {!phoneVerified && isSendOTPCliked && (
                <div className="flex gap-2">

                  <input
                    type="text"
                    value={otp}
                    maxLength={6}
                    placeholder="Enter OTP"
                    onChange={(e) =>
                      setOtp(e.target.value)
                    }
                    className="
                      flex-1
                      border
                      rounded-lg
                      px-3
                      py-2
                      text-sm
                    "
                  />

                  <Button
                    type="button"
                    onClick={verifyOtp}
                    loading={verifyingOtp}
                  >
                    Verify
                  </Button>
                </div>
              )}

              {phoneVerified && (
                <p className="text-green-600 text-sm">
                  ✓ Phone number verified
                </p>
              )}
            </div>

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 8 characters"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              error={errors.password?.message}
              helperText="Must be 8+ characters with uppercase, number & special character"
              {...register('password')}
            />

            <Input
              label="Confirm Password"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Confirm your password"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}>
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              error={errors.confirm_password?.message}
              {...register('confirm_password')}
            />

            <p className="text-xs text-gray-500">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="text-purple-600 hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-purple-600 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>

            <Button
              type="submit"
              className="w-full"
              loading={isLoading}
              disabled={
                !phoneVerified ||
                emailExists ||
                checkingEmail
              }
            >
              Create Account
            </Button>
          </form>
          </BlockingContainer>

          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{' '}
            <Link
              href={`/login?redirectTo=${encodeURIComponent(
                redirectTo
              )}`}
              className="
                font-medium
                text-purple-600
                hover:underline
              "
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
  )
}