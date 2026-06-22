'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, MapPin, Trash2, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Address } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BlockingContainer } from '@/components/ui/blocking-container'
import { addressSchema, AddressFormData } from '@/lib/validations/checkout'
import toast from 'react-hot-toast'

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const supabase = createClient()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddressFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(addressSchema) as any,
    defaultValues: { country: 'India' },
  })

  const loadAddresses = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })

    setAddresses(data || [])
    setIsLoading(false)
  }

  useEffect(() => { loadAddresses() }, [])

  const onSubmit = async (data: AddressFormData) => {
    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (data.is_default) {
        await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id)
      }

      const { error } = await supabase.from('addresses').insert({
        ...data,
        user_id: user.id,
      })

      if (error) {
        toast.error('Failed to save address')
        return
      }

      toast.success('Address saved!')
      reset()
      setShowForm(false)
      await loadAddresses()
    } catch {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setBusyAction(`delete-${id}`)
    try {
      const { error } = await supabase.from('addresses').delete().eq('id', id)
      if (!error) {
        toast.success('Address deleted')
        setAddresses(addresses.filter((a) => a.id !== id))
      } else {
        toast.error('Failed to delete address')
      }
    } finally {
      setBusyAction(null)
    }
  }

  const handleSetDefault = async (id: string) => {
    setBusyAction(`default-${id}`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id)
      await supabase.from('addresses').update({ is_default: true }).eq('id', id)
      await loadAddresses()
      toast.success('Default address updated')
    } catch {
      toast.error('Failed to update default address')
    } finally {
      setBusyAction(null)
    }
  }

  const isBusy = isSaving || busyAction !== null

  return (
    <BlockingContainer
      busy={isBusy}
      message={isSaving ? 'Saving address...' : 'Updating addresses...'}
      className="container mx-auto px-4 py-8 max-w-2xl"
    >
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Saved Addresses</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4" /> Add Address
        </Button>
      </div>

      {/* Add address form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">New Address</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name" error={errors.full_name?.message} {...register('full_name')} />
              <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
            </div>
            <Input label="Address Line 1" error={errors.address_line1?.message} {...register('address_line1')} />
            <Input label="Address Line 2 (optional)" {...register('address_line2')} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="City" error={errors.city?.message} {...register('city')} />
              <Input label="State" error={errors.state?.message} {...register('state')} />
              <Input label="Postal Code" error={errors.postal_code?.message} {...register('postal_code')} />
              <Input label="Country" defaultValue="India" {...register('country')} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-primary-600" {...register('is_default')} />
              <span className="text-sm text-gray-700">Set as default address</span>
            </label>
            <div className="flex gap-3">
              <Button type="submit" loading={isSaving}>Save Address</Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); reset() }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Address list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <MapPin className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No saved addresses yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <div key={addr.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-900">{addr.full_name}</p>
                    {addr.is_default && (
                      <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{addr.phone}</p>
                  <p className="text-sm text-gray-600">{addr.address_line1}</p>
                  {addr.address_line2 && <p className="text-sm text-gray-600">{addr.address_line2}</p>}
                  <p className="text-sm text-gray-600">
                    {addr.city}, {addr.state} {addr.postal_code}, {addr.country}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!addr.is_default && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefault(addr.id)}
                      loading={busyAction === `default-${addr.id}`}
                      className="text-xs text-purple-600 h-auto px-0 hover:bg-transparent hover:underline"
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(addr.id)}
                    loading={busyAction === `delete-${addr.id}`}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </BlockingContainer>
  )
}
