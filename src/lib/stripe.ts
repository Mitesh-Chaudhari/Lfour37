import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover' as any,
  typescript: true,
})

export async function createPaymentIntent(
  amount: number,
  currency: string = 'INR',
  metadata: Record<string, string> = {},
  shipping?: Stripe.PaymentIntentCreateParams.Shipping
) {
  return stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency,
    automatic_payment_methods: { enabled: true },
    description: 'Lfour37 - Online clothing purchase',
    metadata,
    ...(shipping && { shipping }),
  })
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId)
}

export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  reason?: Stripe.RefundCreateParams.Reason
) {
  const params: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    reason,
  }
  if (amount) {
    params.amount = Math.round(amount * 100)
  }
  return stripe.refunds.create(params)
}

export function constructWebhookEvent(payload: string, signature: string) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  )
}
