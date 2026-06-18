'use client'

import { useState, Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { loginSchema, LoginFormData } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/'
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [emailExists, setEmailExists] = useState(true)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema) as any,
  })
  const email = watch('email')

  useEffect(() => {
    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setEmailExists(true)
      return
    }

    const timeout = setTimeout(async () => {
      try {
        setCheckingEmail(true)

        const res = await fetch(
          '/api/auth/check-email',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
            }),
          }
        )

        const data = await res.json()

        setEmailExists(data.exists)
      } catch {
        setEmailExists(true)
      } finally {
        setCheckingEmail(false)
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [email])

  const onSubmit = async (data: LoginFormData) => {
    if (!emailExists) {
      toast.error(
        'This email is not registered. Please sign up first.'
      )
      return
    }
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Invalid email or password')
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('Please verify your email first')
        } else {
          toast.error(error.message)
        }
        return
      }

      toast.success('Welcome back!')
      router.push(redirectTo)
      router.refresh()
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-500 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            leftIcon={<Mail className="h-4 w-4" />}
            error={
              errors.email?.message ||
              (!emailExists &&
                email
                ? 'This email is not registered. Please sign up first.'
                : undefined)
            }
            {...register('email')}
          />  
          {checkingEmail && (
            <p className="text-xs text-gray-500">
              Checking email...
            </p>
          )}
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button type="button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-purple-600 hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={isLoading}
            disabled={
              !emailExists ||
              checkingEmail
            }
          >
            Sign In
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Don&apos;t have an account?{' '}
          <Link
            href={`/register?redirectTo=${encodeURIComponent(
              redirectTo
            )}`}
            className="
              font-medium
              text-purple-600
              hover:underline
            "
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 h-96 animate-pulse" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
