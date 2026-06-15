import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Download, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatPrice } from '@/lib/utils'

export const metadata = {
  title: 'Invoices | Lfour37',
}

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/dashboard/invoices')

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, created_at, total, status, payment_status, payment_method')
    .eq('user_id', user.id)
    .in('payment_status', ['completed', 'refunded'])
    .order('created_at', { ascending: false })

  const statusVariant = (status: string) => {
    const map: Record<string, 'success' | 'secondary' | 'warning' | 'destructive'> = {
      delivered: 'success',
      shipped: 'info' as 'success',
      processing: 'warning',
      paid: 'success',
      cancelled: 'destructive',
      refunded: 'secondary',
    }
    return map[status] || 'secondary'
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <p className="text-sm text-gray-500 mt-1">Download invoices for your completed orders</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {orders && orders.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <Link
                          href={`/dashboard/orders`}
                          className="font-mono font-medium text-gray-900 hover:text-purple-600"
                        >
                          #{order.order_number}
                        </Link>
                        <p className="text-xs text-gray-400 capitalize">{order.payment_method}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{formatDate(order.created_at)}</td>
                  <td className="px-6 py-4 font-semibold text-gray-900">{formatPrice(order.total)}</td>
                  <td className="px-6 py-4">
                    <Badge variant={statusVariant(order.status) as any}>
                      {order.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a
                      href={`/api/invoices/${order.id}`}
                      download={`invoice-${order.order_number}.html`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 border border-purple-200 hover:border-purple-300 rounded-lg transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center">
            <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No invoices yet</p>
            <p className="text-sm text-gray-400 mt-1">Invoices appear after your payment is confirmed</p>
          </div>
        )}
      </div>
    </div>
  )
}
