import Razorpay from 'razorpay'

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function createRazorpayOrder(amount: number, receipt: string) {
  return razorpay.orders.create({
    amount: Math.round(amount * 100), // paise
    currency: 'INR',
    receipt,
  })
}

export async function createRazorpayRefund(
  paymentId: string,
  amountInRupees: number,
  notes?: Record<string, string>
) {
  return razorpay.payments.refund(paymentId, {
    amount: Math.round(amountInRupees * 100),
    speed: 'normal',
    notes,
  })
}

export async function fetchRazorpayPayment(paymentId: string) {
  return razorpay.payments.fetch(paymentId)
}