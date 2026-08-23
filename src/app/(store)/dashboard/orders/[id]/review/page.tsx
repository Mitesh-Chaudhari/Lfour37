import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { buildAuthHref } from '@/lib/auth-redirect'
import {
  OrderReviewClient,
  type ReviewableOrderItem,
} from '@/components/order/order-review-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrderReviewPage({ params }: PageProps) {
  const { id: orderId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      buildAuthHref('/login', `/dashboard/orders/${orderId}/review`)
    )
  }

  const { data: order } = await supabase
    .from('orders')
    .select(
      `
      id,
      order_number,
      status,
      user_id,
      items:order_items(
        id,
        product_id,
        product_name,
        product_image,
        variant_size,
        variant_color,
        status,
        product:products(slug)
      )
    `
    )
    .eq('id', orderId)
    .eq('user_id', user.id)
    .single()

  if (!order) notFound()

  if (!['delivered', 'exchanged', 'returned'].includes(order.status)) {
    redirect('/dashboard/orders')
  }

  const productIds = [
    ...new Set(
      (order.items || [])
        .map((item: { product_id?: string }) => item.product_id)
        .filter(Boolean)
    ),
  ] as string[]

  const { data: existingReviews } = productIds.length
    ? await supabase
        .from('reviews')
        .select('product_id')
        .eq('user_id', user.id)
        .in('product_id', productIds)
    : { data: [] as { product_id: string }[] }

  const reviewed = new Set(
    (existingReviews || []).map((row) => row.product_id)
  )

  const items: ReviewableOrderItem[] = (order.items || [])
    .filter(
      (item: { status?: string | null; product_id?: string }) =>
        item.product_id &&
        item.status !== 'cancelled' &&
        item.status !== 'cancel_requested'
    )
    .map(
      (item: {
        id: string
        product_id: string
        product_name: string
        product_image?: string | null
        variant_size?: string | null
        variant_color?: string | null
        product?: { slug?: string } | { slug?: string }[] | null
      }) => {
        const product = Array.isArray(item.product)
          ? item.product[0]
          : item.product
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_image: item.product_image || null,
          product_slug: product?.slug || null,
          variant_size: item.variant_size || null,
          variant_color: item.variant_color || null,
          already_reviewed: reviewed.has(item.product_id),
        }
      }
    )

  if (!items.length) {
    redirect('/dashboard/orders')
  }

  return (
    <OrderReviewClient orderNumber={order.order_number} items={items} />
  )
}
