import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'

type CodOrderSnapshot = {
  payment_method?: string | null
  payment_status?: string | null
}

/**
 * When a COD order is delivered, treat doorstep cash as collected:
 * orders.payment_status → completed, matching COD payments row → completed.
 */
export async function markCodCollectedOnDelivery(
  orderId: string,
  order?: CodOrderSnapshot | null,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client || createAdminClient()

  let snapshot = order
  if (!snapshot) {
    const { data } = await supabase
      .from('orders')
      .select('payment_method, payment_status')
      .eq('id', orderId)
      .maybeSingle()
    snapshot = data
  }

  if (!snapshot) return
  if (snapshot.payment_method !== 'cod') return
  if (snapshot.payment_status === 'completed') return

  await supabase
    .from('orders')
    .update({ payment_status: 'completed' })
    .eq('id', orderId)
    .eq('payment_method', 'cod')
    .neq('payment_status', 'completed')

  await supabase
    .from('payments')
    .update({ status: 'completed' })
    .eq('order_id', orderId)
    .eq('payment_method', 'cod')
    .neq('status', 'completed')
}
