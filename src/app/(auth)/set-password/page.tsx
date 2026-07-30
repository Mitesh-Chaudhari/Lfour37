'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  resetPasswordSchema,
  ResetPasswordFormData,
} from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BlockingContainer } from '@/components/ui/blocking-container'
import toast from 'react-hot-toast'
import Link from 'next/link'

function SetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') || 'recovery'
  const email = searchParams.get('email')

  const [step, setStep] = useState<'confirm' | 'form' | 'error'>(
    tokenHash ? 'confirm' : 'error'
  )
  const [errorMessage, setErrorMessage] = useState(
    tokenHash
      ? ''
      : 'This set-password link is missing or invalid. Please use Forgot Password on the login page.'
  )
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema) as any,
  })

  const handleContinue = async () => {
    if (!tokenHash) return

    setIsVerifying(true)
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type === 'recovery' ? 'recovery' : 'recovery',
      })

      if (error) {
        setErrorMessage(
          error.message.includes('expired') ||
            error.message.toLowerCase().includes('otp')
            ? 'This link has expired or was already used. Please use Forgot Password to get a new link.'
            : error.message
        )
        setStep('error')
        return
      }

      setStep('form')
    } catch {
      setErrorMessage('Could not verify this link. Please try Forgot Password.')
      setStep('error')
    } finally {
      setIsVerifying(false)
    }
  }

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success('Password set successfully! You can sign in anytime.')
      router.push('/login')
    } catch {
      toast.error('Failed to set password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {step === 'confirm' && (
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Set your password</h1>
            <p className="text-gray-500 text-sm">
              {email
                ? `Continue to set a password for ${email}.`
                : 'Continue to set a password for your account.'}
            </p>
            <p className="text-xs text-gray-400">
              For your security, we only activate this link after you confirm below.
            </p>
            <Button
              className="w-full"
              onClick={handleContinue}
              loading={isVerifying}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Link unavailable</h1>
            <p className="text-sm text-red-600">{errorMessage}</p>
            <Link
              href="/forgot-password"
              className="inline-block text-purple-600 hover:underline text-sm font-medium"
            >
              Request a new password link
            </Link>
          </div>
        )}

        {step === 'form' && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">
                Choose a password
              </h1>
              <p className="text-gray-500 mt-1">
                Your password must be at least 8 characters
              </p>
            </div>

            <BlockingContainer busy={isLoading} message="Saving password...">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  leftIcon={<Lock className="h-4 w-4" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                  error={errors.password?.message}
                  {...register('password')}
                />

                <Input
                  label="Confirm New Password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  leftIcon={<Lock className="h-4 w-4" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                    >
                      {showConfirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                  error={errors.confirm_password?.message}
                  {...register('confirm_password')}
                />

                <Button type="submit" className="w-full" loading={isLoading}>
                  Save password
                </Button>
              </form>
            </BlockingContainer>
          </>
        )}
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center text-gray-500">
          Loading...
        </div>
      }
    >
      <SetPasswordContent />
    </Suspense>
  )
}
