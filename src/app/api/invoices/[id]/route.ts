import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch order with all related data
    const { data: order } = await supabase
      .from('orders')
      .select(`
        *,
        items:order_items(*),
        user:users(email, full_name, phone),
        shipping_method:shipping_methods(name)
      `)
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Ensure only the owner or admin can access
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)
    if (order.user_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orderUser = Array.isArray(order.user) ? order.user[0] : order.user
    const shippingMethod = Array.isArray(order.shipping_method) ? order.shipping_method[0] : order.shipping_method
    const items = order.items || []
    const addr = order.shipping_address as Record<string, string>

    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

    const formatDate = (dateStr: string) =>
      new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    // Generate HTML invoice
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice ${order.order_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 14px; line-height: 1.5; }
  .invoice { max-width: 800px; margin: 40px auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #f3f4f6; }
  .logo { font-size: 24px; font-weight: 800; color: #7c3aed; }
  .invoice-meta { text-align: right; }
  .invoice-meta h2 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 4px; }
  .invoice-meta p { color: #6b7280; font-size: 13px; }
  .addresses { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 32px; }
  .address-block h3 { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.5px; margin-bottom: 8px; }
  .address-block p { font-size: 14px; color: #374151; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #f9fafb; }
  th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
  th:last-child, td:last-child { text-align: right; }
  td { padding: 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151; }
  tr:last-child td { border-bottom: none; }
  .totals { margin-left: auto; max-width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #6b7280; }
  .totals-row.total { border-top: 2px solid #e5e7eb; margin-top: 8px; padding-top: 12px; font-size: 16px; font-weight: 700; color: #111; }
  .discount { color: #059669; }
  .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #f3f4f6; text-align: center; font-size: 12px; color: #9ca3af; }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: #d1fae5; color: #065f46; }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div>
      <div class="logo">Lfour37</div>
      <p style="color: #6b7280; margin-top: 4px; font-size: 13px;">Premium Clothing Brand</p>
    </div>
    <div class="invoice-meta">
      <h2>INVOICE</h2>
      <p>#${order.order_number}</p>
      <p style="margin-top: 8px;">${formatDate(order.created_at)}</p>
      <p style="margin-top: 4px;"><span class="status-badge">${order.status}</span></p>
    </div>
  </div>

  <div class="addresses">
    <div class="address-block">
      <h3>Bill To</h3>
      <p><strong>${orderUser?.full_name || 'Customer'}</strong></p>
      <p>${orderUser?.email || ''}</p>
      ${orderUser?.phone ? `<p>${orderUser.phone}</p>` : ''}
    </div>
    <div class="address-block">
      <h3>Ship To</h3>
      <p><strong>${addr?.full_name || ''}</strong></p>
      <p>${addr?.address_line1 || ''}${addr?.address_line2 ? ', ' + addr.address_line2 : ''}</p>
      <p>${addr?.city || ''}, ${addr?.state || ''} ${addr?.postal_code || ''}</p>
      <p>${addr?.country || ''}</p>
      ${addr?.phone ? `<p>${addr.phone}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Variant</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item: any) => `
      <tr>
        <td>${item.product_name}</td>
        <td style="color: #6b7280;">
          ${[item.variant_size, item.variant_color].filter(Boolean).join(' / ') || '—'}
        </td>
        <td>${item.quantity}</td>
        <td>${formatCurrency(item.unit_price)}</td>
        <td>${formatCurrency(item.total_price)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>${formatCurrency(order.subtotal)}</span>
    </div>
    ${order.discount_amount > 0 ? `
    <div class="totals-row discount">
      <span>Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
      <span>-${formatCurrency(order.discount_amount)}</span>
    </div>` : ''}
    <div class="totals-row">
      <span>Shipping${shippingMethod ? ` (${shippingMethod.name})` : ''}</span>
      <span>${order.shipping_amount === 0 ? 'FREE' : formatCurrency(order.shipping_amount)}</span>
    </div>
    <div class="totals-row">
      <span>Tax</span>
      <span>${formatCurrency(order.tax_amount)}</span>
    </div>
    <div class="totals-row total">
      <span>Total</span>
      <span>${formatCurrency(order.total)}</span>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for shopping with Lfour37!</p>
    <p style="margin-top: 4px;">Payment method: ${order.payment_method} | Payment status: ${order.payment_status}</p>
    ${order.tracking_number ? `<p style="margin-top: 4px;">Tracking: ${order.tracking_number}</p>` : ''}
  </div>
</div>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="invoice-${order.order_number}.html"`,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 })
  }
}
