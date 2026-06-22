import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckoutForm } from '@/components/checkout/checkout-form'

async function getCheckoutData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const [addressesRes, shippingMethodsRes] = await Promise.all([
    supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false }),
    supabase
      .from('shipping_methods')
      .select('*')
      .eq('is_active', true)
      .eq('price', 0)
      .order('price', { ascending: true }),
  ])

  return {
    user,
    addresses: addressesRes.data || [],
    shippingMethods: shippingMethodsRes.data || [],
  }
}

export default async function CheckoutPage() {
  const data = await getCheckoutData()

  if (!data) {
    redirect('/login?redirectTo=/checkout')
  }

  const checkoutData = data!

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>
      <CheckoutForm
        addresses={checkoutData.addresses}
        shippingMethods={checkoutData.shippingMethods}
        user={checkoutData.user}
      />
    </div>
  )
}
