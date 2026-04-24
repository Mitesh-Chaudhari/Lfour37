import { createClient } from '@/lib/supabase/server'
import { AdminReviewsClient } from '@/components/admin/reviews-client'

export default async function AdminReviewsPage() {
  const supabase = await createClient()
  const { data: reviews } = await supabase
    .from('reviews')
    .select(`
      *,
      user:users(full_name, email),
      product:products(name, slug)
    `)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Review Moderation</h1>
        <p className="text-gray-500 mt-1">{reviews?.filter((r) => r.status === 'pending').length || 0} pending reviews</p>
      </div>
      <AdminReviewsClient reviews={reviews || []} />
    </div>
  )
}
