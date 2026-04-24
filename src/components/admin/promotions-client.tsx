'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Coupon } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

const couponSchema = z.object({
  code: z.string().min(3).max(50).toUpperCase(),
  description: z.string().max(200).optional(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().min(0.01),
  minimum_order_amount: z.number().min(0).default(0),
  maximum_discount_amount: z.number().min(0).optional(),
  usage_limit: z.number().int().min(1).optional(),
  is_active: z.boolean().default(true),
  expires_at: z.string().optional(),
})

type CouponFormData = z.infer<typeof couponSchema>

export function PromotionsClient({ coupons: initialCoupons }: { coupons: Coupon[] }) {
  const [coupons, setCoupons] = useState(initialCoupons)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CouponFormData>({
    resolver: zodResolver(couponSchema) as any,
    defaultValues: { discount_type: 'percentage', minimum_order_amount: 0, is_active: true },
  })

  const onSubmit = async (data: CouponFormData) => {
    setIsSaving(true)
    try {
      const { data: created, error } = await supabase.from('coupons').insert({
        ...data,
        code: data.code.toUpperCase(),
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
        maximum_discount_amount: data.maximum_discount_amount || null,
        usage_limit: data.usage_limit || null,
        description: data.description || null,
      }).select().single()

      if (error) {
        toast.error(error.message.includes('unique') ? 'Coupon code already exists' : 'Failed to create coupon')
        return
      }

      setCoupons([created, ...coupons])
      toast.success('Coupon created!')
      reset()
      setShowForm(false)
    } catch {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    const { error } = await supabase.from('coupons').update({ is_active: !currentlyActive }).eq('id', id)
    if (!error) {
      setCoupons(coupons.map((c) => c.id === id ? { ...c, is_active: !currentlyActive } : c))
      toast.success(currentlyActive ? 'Coupon deactivated' : 'Coupon activated')
    }
  }

  const deleteCoupon = async (id: string) => {
    if (!confirm('Delete this coupon?')) return
    const { error } = await supabase.from('coupons').delete().eq('id', id)
    if (!error) {
      setCoupons(coupons.filter((c) => c.id !== id))
      toast.success('Coupon deleted')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" /> Create Coupon
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">New Coupon</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4">
            <Input
              label="Coupon Code"
              placeholder="SUMMER20"
              error={errors.code?.message}
              className="uppercase"
              {...register('code')}
            />
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Discount Type</label>
              <select className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" {...register('discount_type')}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <Input
              label="Discount Value"
              type="number"
              step="0.01"
              min="0"
              error={errors.discount_value?.message}
              {...register('discount_value', { valueAsNumber: true })}
            />
            <Input
              label="Minimum Order ($)"
              type="number"
              step="0.01"
              min="0"
              {...register('minimum_order_amount', { valueAsNumber: true })}
            />
            <Input
              label="Max Discount Amount ($, optional)"
              type="number"
              step="0.01"
              min="0"
              {...register('maximum_discount_amount', { valueAsNumber: true })}
            />
            <Input
              label="Usage Limit (optional)"
              type="number"
              min="1"
              placeholder="Unlimited"
              {...register('usage_limit', { valueAsNumber: true })}
            />
            <Input
              label="Expires At (optional)"
              type="datetime-local"
              {...register('expires_at')}
            />
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
              <input
                type="text"
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                placeholder="Optional description"
                {...register('description')}
              />
            </div>
            <div className="col-span-2 flex gap-3">
              <Button type="submit" loading={isSaving}>Create Coupon</Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); reset() }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Discount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Used / Limit</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Expires</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {coupons.map((coupon) => (
              <tr key={coupon.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-mono font-bold text-gray-900">{coupon.code}</p>
                  {coupon.description && <p className="text-xs text-gray-400">{coupon.description}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">
                    {coupon.discount_type === 'percentage'
                      ? `${coupon.discount_value}%`
                      : `$${coupon.discount_value}`}
                  </span>
                  {coupon.minimum_order_amount > 0 && (
                    <p className="text-xs text-gray-400">Min: ${coupon.minimum_order_amount}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-600">
                    {coupon.usage_count} / {coupon.usage_limit || '∞'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-600 text-xs">
                    {coupon.expires_at ? formatDate(coupon.expires_at) : 'Never'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={coupon.is_active ? 'success' : 'secondary'}>
                    {coupon.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleActive(coupon.id, coupon.is_active)}
                      className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors"
                      title={coupon.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {coupon.is_active ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={() => deleteCoupon(coupon.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {coupons.length === 0 && (
          <div className="py-12 text-center text-gray-400">No coupons yet</div>
        )}
      </div>
    </div>
  )
}
