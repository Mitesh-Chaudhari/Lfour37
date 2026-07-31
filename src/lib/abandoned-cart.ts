import type { CartItem } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import logger from '@/lib/logger'

export type AbandonedCartItem = {
  product_id: string
  variant_id: string
  name: string
  slug: string
  quantity: number
  image_url: string | null
  price: number
}

export const ABANDONED_CART_IDLE_MS = 60 * 60 * 1000 // 1 hour

export function serializeCartItemsForAbandonedCart(
  items: CartItem[]
): AbandonedCartItem[] {
  return items.map((item) => {
    const unitPrice =
      Number(item.product.price || 0) + Number(item.variant.price_modifier || 0)

    return {
      product_id: item.product_id,
      variant_id: item.variant_id,
      name: item.product.name,
      slug: item.product.slug,
      quantity: item.quantity,
      image_url:
        item.variant.image_url ||
        item.product.images?.[0]?.url ||
        null,
      price: unitPrice,
    }
  })
}

export async function markAbandonedCartRecovered(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('abandoned_carts')
      .update({
        recovered_at: new Date().toISOString(),
        items: [],
      })
      .eq('user_id', userId)
      .is('recovered_at', null)

    if (error) {
      logger.warn('Failed to mark abandoned cart recovered', { error, userId })
    }
  } catch (error) {
    logger.warn('Failed to mark abandoned cart recovered', { error, userId })
  }
}
