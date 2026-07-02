import nodemailer from 'nodemailer'
import { Order } from '@/types'
import logger from '@/lib/logger'
import {
  formatOrderItemsSummary,
  getDelhiveryTrackingUrl,
} from '@/lib/whatsapp/templates'

/** Shipped/delivered customer emails are sent from Delhivery milestone sync only. */
const DELHIVERY_MANAGED_ORDER_STATUSES = new Set(['shipped', 'delivered'])

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
])

function resolveFromAddress(): string {
  if (process.env.EMAIL_FROM?.trim()) {
    return process.env.EMAIL_FROM.trim()
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      const host = new URL(appUrl).hostname.replace(/^www\./, '')
      if (host && !host.includes('localhost')) {
        return `noreply@${host}`
      }
    } catch {
      // Ignore invalid URL values.
    }
  }

  return 'noreply@example.com'
}

const FROM = resolveFromAddress()

function getFromDomain(from: string): string | null {
  const at = from.lastIndexOf('@')
  if (at === -1) {
    return null
  }
  return from.slice(at + 1).toLowerCase()
}

function isResendSmtp(): boolean {
  return (process.env.SMTP_HOST || '').includes('resend.com')
}

function assertFromAddressAllowed(): void {
  const domain = getFromDomain(FROM)
  if (!domain) {
    throw new Error(
      `EMAIL_FROM is invalid (${FROM}). Use an address like orders@yourdomain.com`
    )
  }

  if (!isResendSmtp() || !FREE_EMAIL_DOMAINS.has(domain)) {
    return
  }

  const message =
    `EMAIL_FROM (${FROM}) uses ${domain}, which Resend does not allow. ` +
    'Verify your domain at https://resend.com/domains and set EMAIL_FROM to an address on that domain, e.g. orders@lfour37.com'

  logger.error('Invalid EMAIL_FROM for Resend SMTP', {
    from: FROM,
    domain,
    hint: message,
  })
  throw new Error(message)
}

function formatMailError(error: unknown): Record<string, unknown> | string {
  if (!(error instanceof Error)) {
    return String(error)
  }

  const nodemailerError = error as Error & {
    code?: string
    response?: string
    responseCode?: number
    command?: string
  }

  return {
    message: nodemailerError.message,
    name: nodemailerError.name,
    code: nodemailerError.code,
    response: nodemailerError.response,
    responseCode: nodemailerError.responseCode,
    command: nodemailerError.command,
  }
}

function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  )
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    )
  }

  const port = Number(process.env.SMTP_PORT) || 587
  const secure =
    process.env.SMTP_SECURE === 'true' || port === 465

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

async function deliverMail(options: {
  to: string
  subject: string
  html: string
  context?: string
}): Promise<void> {
  const context = options.context || 'email'
  const port = Number(process.env.SMTP_PORT) || 587
  const secure =
    process.env.SMTP_SECURE === 'true' || port === 465

  if (!isEmailConfigured()) {
    logger.warn('Email skipped because SMTP is not configured', {
      context,
      subject: options.subject,
      to: options.to,
      smtpHost: process.env.SMTP_HOST || null,
      hasSmtpUser: Boolean(process.env.SMTP_USER),
      hasSmtpPass: Boolean(process.env.SMTP_PASS),
    })
    return
  }

  assertFromAddressAllowed()

  logger.info('Sending email', {
    context,
    to: options.to,
    subject: options.subject,
    from: FROM,
    smtp: {
      host: process.env.SMTP_HOST,
      port,
      secure,
      user: process.env.SMTP_USER,
    },
  })

  try {
    const result = await getTransporter().sendMail({
      from: FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    })

    logger.info('Email sent successfully', {
      context,
      to: options.to,
      subject: options.subject,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
    })
  } catch (error) {
    logger.error('Email send failed', {
      context,
      to: options.to,
      subject: options.subject,
      from: FROM,
      smtp: {
        host: process.env.SMTP_HOST,
        port,
        secure,
        user: process.env.SMTP_USER,
      },
      error: formatMailError(error),
    })
    throw error
  }
}
const APP_NAME = 'Lfour37'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.lfour37.com/'
const ORDER_NOTIFICATION_EMAIL =
  process.env.ORDER_NOTIFICATION_EMAIL || 'order.lfour37@gmail.com'

function formatEmailInr(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function baseTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${APP_NAME}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #c39c41, #c39c41); padding: 32px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .body { padding: 32px; color: #333; line-height: 1.6; }
        .button { display: inline-block; background: #c39c41; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
        .footer { background: #f9f9f9; padding: 24px; text-align: center; color: #888; font-size: 14px; border-top: 1px solid #eee; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f9f9f9; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>${APP_NAME}</h1></div>
        <div class="body">${content}</div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
          <p><a href="${APP_URL}">Visit our store</a></p>
        </div>
      </div>
    </body>
    </html>
  `
}

export async function sendOrderConfirmationEmail(order: Order, email: string): Promise<void> {
  const itemsHtml = order.items
    ?.map(
      (item) => `
      <tr>
        <td>${item.product_name}${item.variant_size ? ` (${item.variant_size}/${item.variant_color})` : ''}</td>
        <td>${item.quantity}</td>
        <td>${formatEmailInr(item.unit_price)}</td>
        <td>${formatEmailInr(item.total_price)}</td>
      </tr>
    `
    )
    .join('')

  const content = `
    <h2>Order Confirmed! 🎉</h2>
    <p>Thank you for your order. We're preparing it now.</p>
    <p><strong>Order Number:</strong> ${order.order_number}</p>
    <p><strong>Status:</strong> ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</p>
    ${
      order.tracking_number
        ? `<p><strong>Tracking Number:</strong> ${order.tracking_number}</p>`
        : ''
    }

    <h3>Order Summary</h3>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table>
      <tr><td>Subtotal</td><td>${formatEmailInr(order.subtotal)}</td></tr>
      ${order.discount_amount > 0 ? `<tr><td>Discount</td><td>-${formatEmailInr(order.discount_amount)}</td></tr>` : ''}
      <tr><td>Tax</td><td>${formatEmailInr(order.tax_amount)}</td></tr>
      <tr><td>Shipping</td><td>${formatEmailInr(order.shipping_amount)}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${formatEmailInr(order.total)}</strong></td></tr>
    </table>

    <p><strong>Shipping to:</strong><br>
    ${order.shipping_address.full_name}<br>
    ${order.shipping_address.address_line1}<br>
    ${order.shipping_address.city}, ${order.shipping_address.state} ${order.shipping_address.postal_code}</p>

    <a href="${APP_URL}/dashboard/orders" class="button">Track Your Order</a>
  `

  await deliverMail({
    to: email,
    subject: `Order Confirmed - ${order.order_number}`,
    html: baseTemplate(content),
    context: 'order_confirmation_customer',
  })
}

/** Notify store owner when a new order is placed / paid. */
export async function sendNewOrderOwnerNotificationEmail(
  order: Order,
  customerEmail?: string | null
): Promise<void> {
  const addr = order.shipping_address as Order['shipping_address'] & {
    phone?: string
  }

  const itemsHtml = order.items
    ?.map(
      (item) => `
      <tr>
        <td>${item.product_name}${
          item.variant_size
            ? ` (${item.variant_size}${item.variant_color ? ` / ${item.variant_color}` : ''})`
            : ''
        }</td>
        <td>${item.quantity}</td>
        <td>${formatEmailInr(item.unit_price)}</td>
        <td>${formatEmailInr(item.total_price)}</td>
      </tr>
    `
    )
    .join('')

  const content = `
    <h2>New Order Received</h2>
    <p>A customer has placed a new order on ${APP_NAME}.</p>

    <p><strong>Order Number:</strong> ${order.order_number}</p>
    <p><strong>Order ID:</strong> ${order.id}</p>
    <p><strong>Placed at:</strong> ${new Date(order.created_at).toLocaleString('en-IN')}</p>
    <p><strong>Payment:</strong> ${order.payment_method?.toUpperCase() || 'N/A'} · ${order.payment_status}</p>
    <p><strong>Order status:</strong> ${order.status}</p>
    ${customerEmail ? `<p><strong>Customer email:</strong> ${customerEmail}</p>` : ''}

    <h3>Customer &amp; shipping</h3>
    <p>
      ${addr?.full_name || 'Customer'}<br>
      ${addr?.phone ? `Phone: ${addr.phone}<br>` : ''}
      ${addr?.address_line1 || ''}<br>
      ${[addr?.city, addr?.state, addr?.postal_code].filter(Boolean).join(', ')}<br>
      ${addr?.country || 'India'}
    </p>

    <h3>Items</h3>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
      <tbody>${itemsHtml || '<tr><td colspan="4">No items</td></tr>'}</tbody>
    </table>

    <table>
      <tr><td>Subtotal</td><td>${formatEmailInr(order.subtotal)}</td></tr>
      ${
        order.discount_amount > 0
          ? `<tr><td>Discount</td><td>-${formatEmailInr(order.discount_amount)}</td></tr>`
          : ''
      }
      <tr><td>Shipping</td><td>${formatEmailInr(order.shipping_amount)}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${formatEmailInr(order.total)}</strong></td></tr>
    </table>

    <a href="${APP_URL}/admin/orders" class="button">View in Admin</a>
  `

  logger.info('Preparing owner order notification', {
    orderId: order.id,
    orderNumber: order.order_number,
    recipient: ORDER_NOTIFICATION_EMAIL,
    customerEmail: customerEmail || null,
  })

  await deliverMail({
    to: ORDER_NOTIFICATION_EMAIL,
    subject: `New Order - ${order.order_number} (${formatEmailInr(order.total)})`,
    html: baseTemplate(content),
    context: 'order_notification_owner',
  })
}

export async function sendOrderStatusEmail(
  order: Order,
  email: string,
  status: string
): Promise<void> {
  if (DELHIVERY_MANAGED_ORDER_STATUSES.has(status)) {
    logger.info('Skipped order status email; Delhivery handles this milestone', {
      status,
      orderId: order.id,
      orderNumber: order.order_number,
    })
    return
  }

  const statusMessages: Record<string, { subject: string; message: string }> = {
    cancelled: {
      subject: `Order ${order.order_number} cancelled`,
      message:
        'Your order has been cancelled. If you paid, a refund will be processed within 5-10 business days.',
    },
  }

  const { subject, message } = statusMessages[status] || {
    subject: `Order ${order.order_number} update`,
    message: `Your order status has been updated to: ${status}`,
  }

  const content = `
    <h2>Order Update</h2>
    <p>${message}</p>
    <p><strong>Order Number:</strong> ${order.order_number}</p>
    <a href="${APP_URL}/dashboard/orders/${order.id}" class="button">View Order</a>
  `

  await deliverMail({
    to: email,
    subject,
    html: baseTemplate(content),
    context: `order_status_${status}`,
  })
}

export async function sendShipmentStatusEmail({
  order,
  email,
  milestone,
  carrierStatus,
  trackingNumber,
  expectedDeliveryDate,
  instructions,
}: {
  order: Order
  email: string
  milestone: string
  carrierStatus: string
  trackingNumber: string
  expectedDeliveryDate?: string | null
  instructions?: string | null
}): Promise<void> {
  const ordersUrl = `${APP_URL}/dashboard/orders`
  const itemsSummary = formatOrderItemsSummary(order.items || [])
  const delhiveryTrackingUrl = getDelhiveryTrackingUrl(trackingNumber)

  if (milestone === 'delivered') {
    const content = `
      <h2>Your order has been delivered! 🎉</h2>
      <p>We hope you love your purchase ❤️</p>
      <p><strong>Order ID:</strong> ${order.order_number}</p>
      <a href="${ordersUrl}" class="button">Check Order</a>
    `

    await deliverMail({
      to: email,
      subject: `Your order ${order.order_number} has been delivered!`,
      html: baseTemplate(content),
      context: 'shipment_delivered',
    })
    return
  }

  const messages: Record<string, { subject: string; heading: string; message: string }> = {
    shipment_created: {
      subject: `Your order ${order.order_number} has been shipped!`,
      heading: 'Your order has been shipped 🚚',
      message: 'Delhivery has received your shipment and it is on the way.',
    },
    picked_up: {
      subject: `Order ${order.order_number} has been picked up`,
      heading: 'Your order has been picked up 🚚',
      message: 'Delhivery has picked up your package from our facility.',
    },
    in_transit: {
      subject: `Order ${order.order_number} is in transit`,
      heading: 'Your order is in transit 🚚',
      message: 'Your package is moving through the Delhivery network.',
    },
    out_for_delivery: {
      subject: `Order ${order.order_number} is out for delivery`,
      heading: 'Your order is out for delivery 🚚',
      message: 'Please keep your phone available for the delivery agent.',
    },
    delivery_exception: {
      subject: `Delivery update for ${order.order_number}`,
      heading: 'Your delivery needs attention',
      message: instructions || 'Delhivery reported an issue while attempting delivery.',
    },
    return_to_origin: {
      subject: `Return update for ${order.order_number}`,
      heading: 'Package returning to sender',
      message: 'Delhivery is returning this package to our facility.',
    },
  }

  const copy = messages[milestone] || {
    subject: `Shipping update for ${order.order_number}`,
    heading: 'Shipping update',
    message: `Delhivery updated your shipment to: ${carrierStatus}.`,
  }
  const eta = expectedDeliveryDate
    ? new Date(expectedDeliveryDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  const content = `
    <h2>${copy.heading}</h2>
    <p>${copy.message}</p>
    <p><strong>Order ID:</strong> ${order.order_number}</p>
    <p><strong>Items:</strong> ${itemsSummary}</p>
    <p><strong>Tracking number:</strong> ${trackingNumber}</p>
    <p><strong>Current status:</strong> ${carrierStatus}</p>
    ${eta ? `<p><strong>Expected delivery:</strong> ${eta}</p>` : ''}
    <p><strong>Track on Delhivery:</strong> <a href="${delhiveryTrackingUrl}">${delhiveryTrackingUrl}</a></p>
    <a href="${delhiveryTrackingUrl}" class="button">Track Your Order</a>
  `

  await deliverMail({
    to: email,
    subject: copy.subject,
    html: baseTemplate(content),
    context: `shipment_${milestone}`,
  })
}

export async function sendReversePickupStatusEmail({
  order,
  email,
  milestone,
  carrierStatus,
  trackingNumber,
  itemLabel,
  pickupType,
}: {
  order: Order
  email: string
  milestone: 'reverse_picked_up' | 'reverse_dto'
  carrierStatus: string
  trackingNumber: string
  itemLabel: string
  pickupType?: 'return' | 'exchange'
}): Promise<void> {
  const ordersUrl = `${APP_URL}/dashboard/orders`
  const delhiveryTrackingUrl = getDelhiveryTrackingUrl(trackingNumber)
  const flowLabel = pickupType === 'exchange' ? 'exchange' : 'return'

  if (milestone === 'reverse_dto') {
    const content = `
      <h2>We've received your ${flowLabel} item ✅</h2>
      <p>Delhivery has delivered your item back to our facility.</p>
      <p><strong>Order ID:</strong> ${order.order_number}</p>
      <p><strong>Item:</strong> ${itemLabel}</p>
      <p><strong>Carrier status:</strong> ${carrierStatus}</p>
      ${
        pickupType === 'exchange'
          ? '<p>Your exchange replacement shipment will continue to update separately.</p>'
          : '<p>We will process your refund shortly as per our return policy.</p>'
      }
      <a href="${ordersUrl}" class="button">View Order</a>
    `

    await deliverMail({
      to: email,
      subject: `${flowLabel === 'exchange' ? 'Exchange' : 'Return'} item received for order ${order.order_number}`,
      html: baseTemplate(content),
      context: 'reverse_pickup_dto',
    })
    return
  }

  const content = `
    <h2>Your ${flowLabel} pickup is complete 📦</h2>
    <p>Delhivery has collected your item from your address.</p>
    <p><strong>Order ID:</strong> ${order.order_number}</p>
    <p><strong>Item:</strong> ${itemLabel}</p>
    <p><strong>Return tracking number:</strong> ${trackingNumber}</p>
    <p><strong>Current status:</strong> ${carrierStatus}</p>
    <p><strong>Track on Delhivery:</strong> <a href="${delhiveryTrackingUrl}">${delhiveryTrackingUrl}</a></p>
    <a href="${delhiveryTrackingUrl}" class="button">Track Return Pickup</a>
  `

  await deliverMail({
    to: email,
    subject: `${flowLabel === 'exchange' ? 'Exchange' : 'Return'} item picked up for order ${order.order_number}`,
    html: baseTemplate(content),
    context: 'reverse_pickup_picked_up',
  })
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const content = `
    <h2>Reset Your Password</h2>
    <p>We received a request to reset your password. Click the button below to create a new password.</p>
    <p>This link will expire in 1 hour.</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <p style="color:#888;font-size:14px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
  `

  await deliverMail({
    to: email,
    subject: 'Reset Your Password',
    html: baseTemplate(content),
    context: 'password_reset',
  })
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const content = `
    <h2>Welcome to ${APP_NAME}, ${name}! 👋</h2>
    <p>We're thrilled to have you join us. Discover our curated collection of premium clothing.</p>
    <a href="${APP_URL}/products" class="button">Start Shopping</a>
  `

  await deliverMail({
    to: email,
    subject: `Welcome to ${APP_NAME}!`,
    html: baseTemplate(content),
    context: 'welcome',
  })
}

export async function sendNewsletterConfirmationEmail(email: string): Promise<void> {
  const content = `
    <h2>You're subscribed! 🎉</h2>
    <p>You've successfully subscribed to our newsletter. Get ready for exclusive deals, new arrivals, and fashion tips delivered to your inbox.</p>
    <a href="${APP_URL}/products" class="button">Explore New Arrivals</a>
  `

  await deliverMail({
    to: email,
    subject: `Welcome to ${APP_NAME} Newsletter!`,
    html: baseTemplate(content),
    context: 'newsletter_confirmation',
  })
}

export function getEmailConfigStatus() {
  const port = Number(process.env.SMTP_PORT) || 587
  const secure =
    process.env.SMTP_SECURE === 'true' || port === 465
  const fromDomain = getFromDomain(FROM)
  const resendFromBlocked =
    isResendSmtp() && Boolean(fromDomain && FREE_EMAIL_DOMAINS.has(fromDomain))

  return {
    configured: isEmailConfigured(),
    from: FROM,
    fromDomain,
    resendFromBlocked,
    smtp: {
      host: process.env.SMTP_HOST || null,
      port,
      secure,
      user: process.env.SMTP_USER || null,
      hasPass: Boolean(process.env.SMTP_PASS),
    },
    defaultRecipient: ORDER_NOTIFICATION_EMAIL,
  }
}

/** Send a one-off test message to verify SMTP / Resend setup. */
export async function sendTestEmail(to: string): Promise<void> {
  const config = getEmailConfigStatus()

  const content = `
    <h2>Test email from ${APP_NAME}</h2>
    <p>If you received this, SMTP is working correctly.</p>
    <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
    <p><strong>From:</strong> ${config.from}</p>
    <p><strong>SMTP host:</strong> ${config.smtp.host || 'not set'}</p>
    <p><strong>SMTP port:</strong> ${config.smtp.port} (${config.smtp.secure ? 'SSL' : 'STARTTLS'})</p>
  `

  await deliverMail({
    to,
    subject: `[Test] ${APP_NAME} email delivery`,
    html: baseTemplate(content),
    context: 'test_email',
  })
}
