import nodemailer from 'nodemailer'
import { Order } from '@/types'
import logger from '@/lib/logger'

const FROM = process.env.EMAIL_FROM || 'noreply@threadsmarket.com'

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
}): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn('Email skipped because SMTP is not configured', {
      subject: options.subject,
      to: options.to,
    })
    return
  }

  await getTransporter().sendMail({
    from: FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
  })
}
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Lfour37'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
        .header { background: linear-gradient(135deg, #d946ef, #a21caf); padding: 32px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .body { padding: 32px; color: #333; line-height: 1.6; }
        .button { display: inline-block; background: #d946ef; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
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
        <td>$${item.unit_price.toFixed(2)}</td>
        <td>$${item.total_price.toFixed(2)}</td>
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
      <tr><td>Subtotal</td><td>$${order.subtotal.toFixed(2)}</td></tr>
      ${order.discount_amount > 0 ? `<tr><td>Discount</td><td>-$${order.discount_amount.toFixed(2)}</td></tr>` : ''}
      <tr><td>Tax</td><td>$${order.tax_amount.toFixed(2)}</td></tr>
      <tr><td>Shipping</td><td>$${order.shipping_amount.toFixed(2)}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>$${order.total.toFixed(2)}</strong></td></tr>
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
  })
}

export async function sendOrderStatusEmail(
  order: Order,
  email: string,
  status: string
): Promise<void> {
  const statusMessages: Record<string, { subject: string; message: string }> = {
    shipped: {
      subject: `Your order ${order.order_number} has shipped!`,
      message: `Great news! Your order is on its way.${order.tracking_number ? ` Tracking number: <strong>${order.tracking_number}</strong>` : ''}`,
    },
    delivered: {
      subject: `Your order ${order.order_number} has been delivered!`,
      message: 'Your order has been delivered. We hope you love your new items!',
    },
    cancelled: {
      subject: `Order ${order.order_number} cancelled`,
      message: 'Your order has been cancelled. If you paid, a refund will be processed within 5-10 business days.',
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
  const messages: Record<string, { subject: string; heading: string; message: string }> = {
    shipment_created: {
      subject: `Shipment created for ${order.order_number}`,
      heading: 'Your shipment is being prepared',
      message: 'Delhivery has received the shipment details from us.',
    },
    picked_up: {
      subject: `Order ${order.order_number} has been picked up`,
      heading: 'Your package is on the move',
      message: 'Delhivery has picked up your package from our facility.',
    },
    in_transit: {
      subject: `Order ${order.order_number} is in transit`,
      heading: 'Your package is travelling to you',
      message: 'Your package is moving through the Delhivery network.',
    },
    out_for_delivery: {
      subject: `Order ${order.order_number} is out for delivery`,
      heading: 'Arriving today',
      message: 'Please keep your phone available for the delivery agent.',
    },
    delivered: {
      subject: `Order ${order.order_number} has been delivered`,
      heading: 'Delivered',
      message: 'Your order has been delivered. We hope you love it!',
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
  const trackingUrl = `${APP_URL}/dashboard/orders`
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
    <p><strong>Order:</strong> ${order.order_number}</p>
    <p><strong>Tracking number:</strong> ${trackingNumber}</p>
    <p><strong>Current status:</strong> ${carrierStatus}</p>
    ${eta ? `<p><strong>Expected delivery:</strong> ${eta}</p>` : ''}
    <a href="${trackingUrl}" class="button">Track Your Order</a>
  `

  await deliverMail({
    to: email,
    subject: copy.subject,
    html: baseTemplate(content),
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
  })
}
