export const ORDER_DOCUMENT_BRAND = 'LFOUR37'

export type OrderDocumentItem = {
  name: string
  imageUrl: string | null
  size: string | null
  color: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type OrderDocumentBilling = {
  subtotal: number
  discount: number
  shippingAmount: number
  shippingLabel: string
  codCharges: number
  showCodCharges: boolean
  grandTotal: number
  paymentMode: string
}

export type OrderDocumentData = {
  orderId: string
  orderNumber: string
  orderDate: string
  customerFirstName: string
  customerName: string
  phone: string | null
  addressLines: string[]
  items: OrderDocumentItem[]
  billing: OrderDocumentBilling
  estimatedDelivery: string | null
  ordersUrl: string
  companyName: string
  companyLegalName: string
  companyAddress: string
  supportEmail: string
  supportPhone: string
  website: string
  brandSignOff: string
}

type OrderLike = {
  id: string
  order_number: string
  created_at: string
  subtotal: number
  discount_amount: number
  shipping_amount: number
  total: number
  payment_method: string
  shipping_address: {
    full_name?: string | null
    phone?: string | null
    address_line1?: string | null
    address_line2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
  }
  items?: Array<{
    product_name: string
    quantity: number
    unit_price: number
    total_price: number
    variant_size?: string | null
    variant_color?: string | null
    product_image?: string | null
  }>
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}

function getCustomerAppUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl)
      const isLocalhost =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1'

      if (!isLocalhost) {
        return url.origin.replace(/\/$/, '')
      }
    } catch {
      // Fall through to production URL.
    }
  }

  return 'https://www.lfour37.com'
}

export function getOrderDocumentCompanyConfig() {
  return {
    name: ORDER_DOCUMENT_BRAND,
    legalName:
      process.env.INVOICE_COMPANY_LEGAL_NAME ||
      'Yadevi Lifestyle Private Limited',
    address:
      process.env.INVOICE_COMPANY_ADDRESS ||
      'Shop No.2, Swagat Complex, Pandit Nehru Marg, Valkeshwari, Park Colony, Jamnagar, Gujarat 361008',
    supportPhone: process.env.INVOICE_SUPPORT_PHONE || '+91-9978437437',
    supportEmail: process.env.INVOICE_SUPPORT_EMAIL || 'support@lfour37.com',
    website: process.env.INVOICE_COMPANY_WEBSITE || getCustomerAppUrl(),
  }
}

export function formatOrderDocumentDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatOrderDocumentInr(amount: number): string {
  return `₹ ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** jsPDF Helvetica cannot render ₹ reliably. */
export function formatOrderDocumentInrPlain(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPaymentMode(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'cod':
      return 'COD'
    case 'razorpay':
      return 'Online'
    case 'stripe':
      return 'Card'
    case 'crypto':
      return 'Crypto'
    default:
      return paymentMethod.replace(/_/g, ' ').toUpperCase()
  }
}

function buildBilling(order: OrderLike): OrderDocumentBilling {
  const subtotal = Number(order.subtotal) || 0
  const discount = Number(order.discount_amount) || 0
  const shippingAmount = Number(order.shipping_amount) || 0
  const grandTotal = Number(order.total) || 0
  const netSubtotal = round2(subtotal - discount)
  const remainder = round2(grandTotal - netSubtotal - shippingAmount)
  const isCod = order.payment_method === 'cod'
  const codCharges = isCod && remainder > 0 ? remainder : 0

  return {
    subtotal: round2(subtotal),
    discount,
    shippingAmount,
    shippingLabel: shippingAmount <= 0 ? 'FREE' : formatOrderDocumentInr(shippingAmount),
    codCharges,
    showCodCharges: isCod,
    grandTotal,
    paymentMode: formatPaymentMode(order.payment_method),
  }
}

function buildAddressLines(
  address: OrderLike['shipping_address']
): string[] {
  const lines: string[] = []

  if (address.full_name?.trim()) {
    lines.push(address.full_name.trim())
  }

  if (address.address_line1?.trim()) {
    lines.push(address.address_line1.trim())
  }

  if (address.address_line2?.trim()) {
    lines.push(address.address_line2.trim())
  }

  const cityStatePin = [address.city, address.postal_code]
    .filter(Boolean)
    .join(', ')

  if (cityStatePin) {
    lines.push(cityStatePin)
  }

  if (address.state?.trim()) {
    lines.push(address.state.trim())
  }

  lines.push(address.country?.trim() || 'India')

  return lines
}

function buildItems(order: OrderLike): OrderDocumentItem[] {
  return (order.items || []).map((item) => ({
    name: item.product_name,
    imageUrl: item.product_image?.trim() || null,
    size: item.variant_size?.trim() || null,
    color: item.variant_color?.trim() || null,
    quantity: item.quantity,
    unitPrice: Number(item.unit_price) || 0,
    lineTotal: Number(item.total_price) || 0,
  }))
}

export function buildOrderDocumentData(
  order: OrderLike,
  options?: { expectedDeliveryDate?: string | null }
): OrderDocumentData {
  const company = getOrderDocumentCompanyConfig()
  const addr = order.shipping_address
  const firstName = addr.full_name?.trim().split(/\s+/)[0] || 'there'

  let estimatedDelivery: string | null = null
  if (options?.expectedDeliveryDate) {
    estimatedDelivery = formatOrderDocumentDate(options.expectedDeliveryDate)
  }

  return {
    orderId: order.order_number,
    orderNumber: order.order_number,
    orderDate: formatOrderDocumentDate(order.created_at),
    customerFirstName: firstName,
    customerName: addr.full_name?.trim() || 'Customer',
    phone: addr.phone?.trim() || null,
    addressLines: buildAddressLines(addr),
    items: buildItems(order),
    billing: buildBilling(order),
    estimatedDelivery,
    ordersUrl: `${getCustomerAppUrl()}/dashboard/orders`,
    companyName: company.name,
    companyLegalName: company.legalName,
    companyAddress: company.address,
    supportEmail: company.supportEmail,
    supportPhone: company.supportPhone,
    website: company.website,
    brandSignOff: ORDER_DOCUMENT_BRAND,
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderBillingRows(
  billing: OrderDocumentBilling,
  formatAmount: (amount: number) => string
): string {
  const rows = [
    `<tr><td style="padding:4px 0;color:#444;">Sub-total:</td><td style="padding:4px 0;text-align:right;color:#111;">${formatAmount(billing.subtotal)}</td></tr>`,
  ]

  if (billing.discount > 0) {
    rows.push(
      `<tr><td style="padding:4px 0;color:#444;">Discount:</td><td style="padding:4px 0;text-align:right;color:#111;">-${formatAmount(billing.discount)}</td></tr>`
    )
  }

  rows.push(
    `<tr><td style="padding:4px 0;color:#444;">Shipping Charges:</td><td style="padding:4px 0;text-align:right;color:#111;">${billing.shippingLabel === 'FREE' ? 'FREE' : billing.shippingLabel}</td></tr>`
  )

  if (billing.showCodCharges) {
    rows.push(
      `<tr><td style="padding:4px 0;color:#444;">COD Charges:</td><td style="padding:4px 0;text-align:right;color:#111;">${formatAmount(billing.codCharges)}</td></tr>`
    )
  }

  rows.push(
    `<tr><td style="padding:8px 0 4px;font-weight:700;color:#111;">Grand Total:</td><td style="padding:8px 0 4px;text-align:right;font-weight:700;color:#111;">${formatAmount(billing.grandTotal)}</td></tr>`,
    `<tr><td style="padding:4px 0;color:#444;">Mode of Payment:</td><td style="padding:4px 0;text-align:right;color:#111;">${escapeHtml(billing.paymentMode)}</td></tr>`
  )

  return rows.join('')
}

function renderProductRows(
  items: OrderDocumentItem[],
  formatAmount: (amount: number) => string
): string {
  return items
    .map((item) => {
      const variantParts = [
        item.size ? `Size: ${item.size}` : null,
        `Qty: ${item.quantity}`,
      ].filter(Boolean)

      const imageCell = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:4px;border:1px solid #ececec;" />`
        : `<div style="width:56px;height:56px;background:#f3f3f3;border-radius:4px;border:1px solid #ececec;"></div>`

      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #ececec;vertical-align:top;color:#111;">
            <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td style="width:68px;padding-right:12px;vertical-align:top;">${imageCell}</td>
                <td style="vertical-align:top;">
                  <div style="font-size:15px;line-height:1.45;">${escapeHtml(item.name)}</div>
                  <div style="font-size:13px;color:#666;margin-top:4px;">${escapeHtml(variantParts.join(' | '))}</div>
                </td>
              </tr>
            </table>
          </td>
          <td style="padding:14px 8px;border-bottom:1px solid #ececec;text-align:right;vertical-align:top;color:#111;white-space:nowrap;width:90px;">${formatAmount(item.unitPrice)}</td>
          <td style="padding:14px 0;border-bottom:1px solid #ececec;text-align:right;vertical-align:top;color:#111;white-space:nowrap;width:90px;">${formatAmount(item.lineTotal)}</td>
        </tr>
      `
    })
    .join('')
}

export function buildOrderDocumentEmailHtml(
  data: OrderDocumentData,
  options?: { introVariant?: 'confirmation' | 'invoice' }
): string {
  const introVariant = options?.introVariant || 'confirmation'
  const formatAmount = formatOrderDocumentInr

  const introCopy =
    introVariant === 'invoice'
      ? `Your tax invoice for order <strong>${escapeHtml(data.orderNumber)}</strong> is attached below. Thank you for shopping with us.`
      : `Hurrayyyyy! We're delighted you decided to place your order with us! We're preparing your package and will notify you as soon as it is shipped along with tracking details.<br><br>You can email us if you have any questions and our team will help you out.`

  const estimatedDeliveryBlock = data.estimatedDelivery
    ? `<p style="margin:0 0 18px;font-size:14px;color:#111;"><strong>Estimated Delivery by ${escapeHtml(data.estimatedDelivery)}.</strong></p>`
    : ''

  const addressHtml = data.addressLines
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.companyName)} Order ${escapeHtml(data.orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial, Helvetica, sans-serif;color:#111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
          <tr>
            <td style="padding:0 0 18px;font-size:14px;color:#111;">
              <strong>Order ID:</strong> ${escapeHtml(data.orderNumber)} |
              <strong>Order Date:</strong> ${escapeHtml(data.orderDate)}
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 8px;font-size:16px;line-height:1.6;color:#111;">
              Hey ${escapeHtml(data.customerFirstName)},
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 18px;font-size:15px;line-height:1.7;color:#333;">
              ${introCopy}
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 28px;">
              <a href="${escapeHtml(data.ordersUrl)}" style="display:inline-block;padding:12px 22px;border:1px solid #111;color:#111;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">My Orders</a>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 10px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#111;">
              Order Details
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 18px;font-size:14px;line-height:1.8;color:#111;">
              <div><strong>ORDER ID:</strong> ${escapeHtml(data.orderNumber)}</div>
              <div><strong>ORDER DATE:</strong> ${escapeHtml(data.orderDate)}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.5px;color:#111;">
              Delivery Address
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 18px;font-size:14px;line-height:1.8;color:#111;">
              ${addressHtml}
              ${data.phone ? `<div style="margin-top:8px;"><strong>Contact No.:</strong> ${escapeHtml(data.phone)}</div>` : ''}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 0 10px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#111;border-top:1px solid #ececec;">
              Order Summary
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 8px;">
              ${estimatedDeliveryBlock}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <thead>
                  <tr>
                    <th align="left" style="padding:0 0 8px;font-size:13px;font-weight:700;color:#666;border-bottom:1px solid #ececec;"></th>
                    <th align="right" style="padding:0 8px 8px;font-size:13px;font-weight:700;color:#666;border-bottom:1px solid #ececec;width:90px;">Price</th>
                    <th align="right" style="padding:0 0 8px;font-size:13px;font-weight:700;color:#666;border-bottom:1px solid #ececec;width:90px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderProductRows(data.items, formatAmount)}
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 0 18px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.5px;color:#111;margin-bottom:10px;">Billing Details</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
                ${renderBillingRows(data.billing, formatAmount)}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 0 8px;font-size:15px;line-height:1.6;color:#111;border-top:1px solid #ececec;">
              Have a great day!<br>
              ${escapeHtml(data.brandSignOff)}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 0 0;font-size:12px;line-height:1.7;color:#666;border-top:1px solid #ececec;">
              ${escapeHtml(data.companyAddress)}<br>
              ${escapeHtml(data.supportEmail)}${data.supportPhone ? ` | ${escapeHtml(data.supportPhone)}` : ''} |
              <a href="${escapeHtml(data.website)}" style="color:#666;">${escapeHtml(data.website.replace(/^https?:\/\//, ''))}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
