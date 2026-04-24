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