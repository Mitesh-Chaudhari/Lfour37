import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Heart } from 'lucide-react'
import { WishlistClient } from '@/components/wishlist/wishlist-client'

export const metadata = {
  title: 'Wishlist | StyleStore',
  description: 'Your saved items',
}

export default async function WishlistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/wishlist')

  const { data: wishlistItems } = await supabase
    .from('wishlist')
    .select(`
      id,
      created_at,
      product:products(
        id, name, slug, price, compare_price, images, status,
        variants:product_variants(id, size, color, stock, is_active)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Wishlist</h1>
          <p className="text-sm text-gray-500 mt-1">{wishlistItems?.length || 0} saved items</p>
        </div>
        <Link href="/products" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
          Continue Shopping →
        </Link>
      </div>

      {wishlistItems && wishlistItems.length > 0 ? (
        <WishlistClient items={wishlistItems as any} userId={user.id} />
      ) : (
        <div className="text-center py-24 bg-white rounded-2xl border border-gray-200">
          <Heart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Your wishlist is empty</h2>
          <p className="text-gray-500 mb-6">Save items you love to come back to later</p>
          <Link
            href="/products"
            className="inline-flex items-center justify-center px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      )}
    </div>
  )
}
