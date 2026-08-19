export type RazorpayCheckoutResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export type RazorpayCheckoutOptions = {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description: string
  prefill?: { contact?: string; name?: string; email?: string }
  theme?: { color?: string; backdrop_color?: string }
  handler: (response: RazorpayCheckoutResponse) => void
  modal?: { ondismiss?: () => void }
}

export type RazorpayCheckoutInstance = { open: () => void }

declare global {
  interface Window {
    Razorpay: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance
  }
}

export {}
