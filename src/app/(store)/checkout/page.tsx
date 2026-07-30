import { createClient } from '@/lib/supabase/server'
import { CheckoutForm } from '@/components/checkout/checkout-form'
import { MetaInitiateCheckoutTracker } from '@/components/meta-pixel/event-trackers'
import { GaBeginCheckoutTracker } from '@/components/google-analytics/event-trackers'

async function getCheckoutData() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const shippingMethodsRes = await supabase
    .from('shipping_methods')
    .select('*')
    .eq('is_active', true)
    .eq('price', 0)
    .order('price', { ascending: true })

  if (!user) {
    return {
      user: null,
      addresses: [],
      shippingMethods: shippingMethodsRes.data || [],
    }
  }

  const [addressesRes, profileRes] = await Promise.all([
    supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false }),
    supabase
      .from('users')
      .select('full_name, phone')
      .eq('id', user.id)
      .single(),
  ])

  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: profileRes.data?.full_name ?? null,
      phone: profileRes.data?.phone ?? null,
    },
    addresses: addressesRes.data || [],
    shippingMethods: shippingMethodsRes.data || [],
  }
}

export default async function CheckoutPage() {
  const checkoutData = await getCheckoutData()

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <MetaInitiateCheckoutTracker />
      <GaBeginCheckoutTracker />
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>
      <CheckoutForm
        addresses={checkoutData.addresses}
        shippingMethods={checkoutData.shippingMethods}
        user={checkoutData.user}
      />
    </div>
  )
}
