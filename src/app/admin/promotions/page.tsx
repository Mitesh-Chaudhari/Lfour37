import { createClient } from '@/lib/supabase/server'
import { PromotionsClient } from '@/components/admin/promotions-client'

export default async function AdminPromotionsPage() {
  const supabase = await createClient()
  const { data: coupons } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Promotions</h1>
        <p className="text-gray-500 mt-1">Manage discount codes and promotions</p>
      </div>
      <PromotionsClient coupons={coupons || []} />
    </div>
  )
}
