import { createAdminClient } from '@/lib/supabase/server'
import type { SalesChannel } from '@/lib/organization'

export type StockMovementType =
  | 'online_sale'
  | 'pos_sale'
  | 'sale_return'
  | 'cancel_restore'
  | 'grn_receive'
  | 'adjustment'
  | 'transfer_out'
  | 'transfer_in'

export type PosPaymentMethod = 'cash' | 'upi' | 'card' | 'mixed'

export { generateVariantBarcode } from '@/lib/barcode'

export async function requireAdminUser() {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return null
  }

  return profile
}

export async function applyStockMovement(params: {
  variantId: string
  delta: number
  movementType: StockMovementType
  locationId?: string | null
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  createdBy?: string | null
  allowNegative?: boolean
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('apply_stock_movement', {
    p_variant_id: params.variantId,
    p_delta: params.delta,
    p_movement_type: params.movementType,
    p_location_id: params.locationId || null,
    p_reference_type: params.referenceType || null,
    p_reference_id: params.referenceId || null,
    p_notes: params.notes || null,
    p_created_by: params.createdBy || null,
    p_allow_negative: params.allowNegative || false,
  })

  if (error) throw error
  return data
}

export async function getOpenPosSession(locationId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pos_sessions')
    .select('*')
    .eq('location_id', locationId)
    .eq('status', 'open')
    .maybeSingle()

  if (error) throw error
  return data
}

export async function lookupVariantByBarcode(
  barcode: string,
  brandId: string,
  locationId?: string
) {
  const admin = createAdminClient()
  const code = barcode.trim()
  if (!code) return null

  const { data, error } = await admin
    .from('product_variants')
    .select(
      `
      id, size, color, stock, sku, barcode, price_modifier, is_active,
      product:products!inner(
        id, name, price, compare_price, sku, brand_id, status, images
      )
    `
    )
    .eq('barcode', code)
    .eq('is_active', true)
    .eq('product.brand_id', brandId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const product = Array.isArray(data.product) ? data.product[0] : data.product
  if (!product || product.status !== 'active') return null

  let stock = Number(data.stock)
  if (locationId) {
    const { data: level } = await admin
      .from('stock_levels')
      .select('quantity')
      .eq('location_id', locationId)
      .eq('variant_id', data.id)
      .maybeSingle()
    if (level) stock = Number(level.quantity)
  }

  return {
    variant_id: data.id as string,
    product_id: product.id as string,
    product_name: product.name as string,
    size: data.size as string,
    color: data.color as string,
    stock,
    barcode: data.barcode as string | null,
    sku: (data.sku as string | null) || (product.sku as string | null),
    unit_price: Number(product.price) + Number(data.price_modifier || 0),
    image:
      Array.isArray(product.images) && product.images[0]
        ? (product.images[0] as { url?: string }).url || null
        : null,
  }
}

export {
  YADEVI_COMPANY_ID,
  LFOUR37_STORE_JAMNAGAR_LOCATION_ID,
  LFOUR37_WAREHOUSE_LOCATION_ID,
  LFOUR37_ONLINE_LOCATION_ID,
} from '@/lib/organization'
export type { SalesChannel }
