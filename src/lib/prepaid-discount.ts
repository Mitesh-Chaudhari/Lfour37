/**
 * Extra discount for prepaid (online) payments, meant to nudge shoppers away
 * from COD. Applied on the amount payable after coupon discounts.
 */
export const PREPAID_DISCOUNT_RATE = 0.05

export const PREPAID_DISCOUNT_LABEL = `Prepaid Discount (${PREPAID_DISCOUNT_RATE * 100}%)`

export function calculatePrepaidDiscount(
  amountAfterCoupon: number,
  paymentMethod: string
): number {
  if (paymentMethod !== 'razorpay') return 0
  if (amountAfterCoupon <= 0) return 0
  return Number((amountAfterCoupon * PREPAID_DISCOUNT_RATE).toFixed(2))
}
