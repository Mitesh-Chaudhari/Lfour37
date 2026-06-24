import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiRateLimit } from '@/lib/rate-limit'
import logger from '@/lib/logger'
import { z } from 'zod'
import { resolveHsnFromCategories, mappingsArrayToRecord } from '@/lib/hsn'

const createOrderSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
    unit_price: z.number().min(0),
  })).min(1),
  shipping_address: z.object({
    full_name: z.string().min(1),
    phone: z.string().min(1),
    address_line1: z.string().min(1),
    address_line2: z.string().nullable().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    postal_code: z.string().min(1),
    country: z.string().default('US'),
  }),
  shipping_method_id: z.string().uuid(),
  coupon_code: z.string().nullable().optional(),
  discount_amount: z.number().min(0).default(0),
  payment_method: z.enum(['razorpay', 'cod']),
  save_address: z.boolean().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const rateLimitRes = apiRateLimit(request)
  if (rateLimitRes) return rateLimitRes

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is suspended
    const { data: userData } = await supabase
      .from('users')
      .select('is_suspended')
      .eq('id', user.id)
      .single()

    if (userData?.is_suspended) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }

    const body = await request.json()
    logger.info('Order request body', { body })
    const parsed = createOrderSchema.safeParse(body)

    if (!parsed.success) {
      logger.error('Order validation failed', { errors: parsed.error.issues, body })
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
    }

    const data = parsed.data

    // Validate all variants exist and have enough stock
    const variantIds = data.items.map((i) => i.variant_id)
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, stock, product_id, size, color, image_url')
      .in('id', variantIds)
      .eq('is_active', true)

    if (!variants || variants.length !== variantIds.length) {
      return NextResponse.json({ error: 'One or more items are unavailable' }, { status: 400 })
    }

    for (const item of data.items) {
      const variant = variants.find((v) => v.id === item.variant_id)
      if (!variant) {
        return NextResponse.json({ error: `Variant ${item.variant_id} not found` }, { status: 400 })
      }
      if (variant.stock < item.quantity) {
        return NextResponse.json({
          error: `Insufficient stock for ${variant.size}/${variant.color}. Only ${variant.stock} available.`
        }, { status: 400 })
      }
    }

    // Validate shipping method
    const { data: shippingMethod } = await supabase
      .from('shipping_methods')
      .select('*')
      .eq('id', data.shipping_method_id)
      .eq('is_active', true)
      .single()

    if (!shippingMethod) {
      return NextResponse.json({ error: 'Invalid shipping method' }, { status: 400 })
    }

    if (Number(shippingMethod.price) > 0) {
      return NextResponse.json(
        { error: 'Only free shipping is available right now' },
        { status: 400 }
      )
    }

    // Validate coupon if provided
    let couponId: string | null = null
    let validatedDiscount = data.discount_amount

    if (data.coupon_code) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', data.coupon_code)
        .eq('is_active', true)
        .single()

      if (!coupon) {
        return NextResponse.json({ error: 'Invalid or expired coupon' }, { status: 400 })
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Coupon has expired' }, { status: 400 })
      }

      if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
        return NextResponse.json({ error: 'Coupon usage limit reached' }, { status: 400 })
      }

      couponId = coupon.id
    }

    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    const discountAmount = Math.min(validatedDiscount, subtotal)
    const afterDiscount = subtotal - discountAmount
    const taxAmount = 0
    const total = Number((afterDiscount + taxAmount + shippingMethod.price).toFixed(2))

    // Get product details for order items
    const productIds = [...new Set(data.items.map((i) => i.product_id))]
    const { data: products } = await supabase
      .from('products')
      .select('id, name, images, hsn_code')
      .in('id', productIds)

    const productsMissingHsn = (products || [])
      .filter((product) => !product.hsn_code)
      .map((product) => product.id)

    const resolvedHsnByProductId: Record<string, string> = {}

    if (productsMissingHsn.length > 0) {
      const [
        { data: productCategories },
        { data: hsnRows },
        { data: allCategories },
      ] = await Promise.all([
        supabase
          .from('product_categories')
          .select('product_id, category_id')
          .in('product_id', productsMissingHsn),
        supabase.from('category_hsn_mappings').select('category_id, hsn_code'),
        supabase.from('categories').select('id, parent_id'),
      ])

      const mappings = mappingsArrayToRecord(hsnRows || [])

      for (const productId of productsMissingHsn) {
        const categoryIds = (productCategories || [])
          .filter((row) => row.product_id === productId)
          .map((row) => row.category_id)
        const hsn = resolveHsnFromCategories(
          categoryIds,
          allCategories || [],
          mappings
        )
        if (hsn) resolvedHsnByProductId[productId] = hsn
      }
    }

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        order_number: '', // Will be generated by trigger
        status: 'pending',
        subtotal: Number(subtotal.toFixed(2)),
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        shipping_amount: shippingMethod.price,
        total,
        coupon_id: couponId,
        coupon_code: data.coupon_code || null,
        shipping_method_id: data.shipping_method_id,
        shipping_address: data.shipping_address,
        payment_method: data.payment_method,
        payment_status: 'pending',
      })
      .select()
      .single()

    if (orderError || !order) {
      logger.error('Failed to create order', { error: orderError, userId: user.id })
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Insert order items
  const orderItems = data.items.map((item) => {
    const product = products?.find((p) => p.id === item.product_id)
    const variant = variants.find((v) => v.id === item.variant_id)

    return {
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: product?.name || 'Unknown Product',

      // USE VARIANT IMAGE
      product_image:
        variant?.image_url ||
        product?.images?.[0]?.url ||
        null,

      variant_size: variant?.size || null,
      variant_color: variant?.color || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: Number((item.unit_price * item.quantity).toFixed(2)),
      hsn_code:
        product?.hsn_code ||
        resolvedHsnByProductId[item.product_id] ||
        null,
    }
  })

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)

    if (itemsError) {
      // Rollback order
      await supabase.from('orders').delete().eq('id', order.id)
      logger.error('Failed to create order items', { error: itemsError, orderId: order.id })
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Save address if requested
    if (data.save_address) {
      await supabase.from('addresses').insert({
        user_id: user.id,
        ...data.shipping_address,
        is_default: false,
      })
    }

    // Track analytics event
    await supabase.from('analytics_events').insert({
      event_type: 'order_created',
      user_id: user.id,
      order_id: order.id,
      properties: { total, item_count: data.items.length, payment_method: data.payment_method },
    })

    logger.info('Order created', { orderId: order.id, userId: user.id, total })

    return NextResponse.json({ order_id: order.id, order_number: order.order_number }, { status: 201 })
  } catch (error) {
    logger.error('Order creation error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
