'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User } from '@/types'
import toast from 'react-hot-toast'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name is required').max(100),
  phone: z.string().max(20).optional(),
  newsletter_subscribed: z.boolean().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema) as any,
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (data) {
        setUser(data)
        reset({
          full_name: data.full_name || '',
          phone: data.phone || '',
          newsletter_subscribed: data.newsletter_subscribed,
        })
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: data.full_name,
          phone: data.phone || null,
          newsletter_subscribed: data.newsletter_subscribed,
        })
        .eq('id', user.id)

      if (error) {
        toast.error('Failed to update profile')
        return
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
    <div className="container mx-auto px-4 py-8 max-w-xl">
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

          <Input
            label="Phone (optional)"
            type="tel"
            placeholder="+1 (555) 000-0000"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary-600"
              {...register('newsletter_subscribed')}
            />
            <span className="text-sm text-gray-700">Subscribe to newsletter</span>
          </label>

          <Button type="submit" loading={isSaving} className="w-full">
            Save Changes
          </Button>
        </form>
      </div>

      {/* Password change section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        <p className="text-sm text-gray-600 mb-4">
          We&apos;ll send a password reset link to your email address.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            if (!user) return
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
              redirectTo: `${window.location.origin}/reset-password`,
            })
            if (!error) toast.success('Password reset email sent!')
            else toast.error(error.message)
          }}
        >
          Send Reset Email
        </Button>
      </div>
    </div>
  )
}
