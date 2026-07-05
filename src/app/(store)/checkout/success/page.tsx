import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, Package, ArrowRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice, formatDate } from '@/lib/utils'
import { getExplorerTxUrl } from '@/lib/crypto/networks'
import { CryptoNetwork } from '@/types'
import { MetaPurchaseTracker } from '@/components/meta-pixel/event-trackers'

interface PageProps {
  searchParams: Promise<{ order_id?: string; tx?: string }>
}

async function getOrder(orderId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*),
      payment:payments(*),
      crypto_tx:crypto_transactions(*)
    `)
    .eq('id', orderId)
    .single()
  return data
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const { order_id, tx } = await searchParams

  if (!order_id) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Order not found</p>
        <Link href="/products" className="mt-4 text-purple-600 hover:underline block">
          Continue Shopping
        </Link>
      </div>
    )
  }

  const order = await getOrder(order_id)

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      {order && (
        <MetaPurchaseTracker
          orderId={order.id}
          value={order.total}
          items={order.items || []}
        />
      )}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-4">
          <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Confirmed!</h1>
        <p className="text-gray-500">
          Thank you for your order. We&apos;ll send you updates via email.
        </p>
      </div>

      {order && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">Order Number</p>
              <p className="text-lg font-bold text-gray-900">{order.order_number}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Date</p>
              <p className="font-medium">{formatDate(order.created_at)}</p>
            </div>
          </div>

          {/* Items summary */}
          <div className="border-t border-gray-100 pt-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Items Ordered</h3>
            {order.items?.map((item: { id: string; product_name: string; quantity: number; variant_size?: string; variant_color?: string; total_price: number }) => (
              <div key={item.id} className="flex justify-between text-sm py-1">
                <span className="text-gray-600">
                  {item.product_name}
                  {item.variant_size && ` (${item.variant_size}/${item.variant_color})`}
                  {' ×'} {item.quantity}
                </span>
                <span className="font-medium">{formatPrice(item.total_price)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatPrice(order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Tax</span>
              <span>{formatPrice(order.tax_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Shipping</span>
              <span>{formatPrice(order.shipping_amount)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </div>

          {/* Shipping address */}
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Shipping To</h3>
            <div className="text-sm text-gray-600">
              <p>{order.shipping_address?.full_name}</p>
              <p>{order.shipping_address?.address_line1}</p>
              <p>
                {order.shipping_address?.city}, {order.shipping_address?.state}{' '}
                {order.shipping_address?.postal_code}
              </p>
            </div>
          </div>

          {/* Crypto tx hash */}
          {tx && order.crypto_tx?.[0]?.network && (
            <div className="border-t border-gray-100 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Transaction</h3>
              <a
                href={getExplorerTxUrl(order.crypto_tx[0].network as CryptoNetwork, tx)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-purple-600 hover:underline"
              >
                <span className="font-mono truncate">{tx.slice(0, 20)}...{tx.slice(-8)}</span>
                <ExternalLink className="h-4 w-4 flex-shrink-0" />
              </a>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="brand" className="flex-1" asChild>
          <Link href="/dashboard/orders" className="flex items-center justify-center gap-2">
            <Package className="h-4 w-4" /> Track Your Order
          </Link>
        </Button>
        <Button variant="outline" className="flex-1" asChild>
          <Link href="/products" className="flex items-center justify-center gap-2">
            Continue Shopping <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
