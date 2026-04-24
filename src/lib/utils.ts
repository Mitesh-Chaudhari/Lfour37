import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  }).format(new Date(dateString))
}

export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length).trim() + '...'
}

export function calculateDiscount(price: number, comparePrice: number): number {
  if (!comparePrice || comparePrice <= price) return 0
  return Math.round(((comparePrice - price) / comparePrice) * 100)
}

export function calculateTax(subtotal: number, taxRate: number = 0.08): number {
  return Number((subtotal * taxRate).toFixed(2))
}

export function calculateOrderTotal(
  subtotal: number,
  discountAmount: number,
  taxRate: number = 0.08,
  shippingAmount: number = 0
): { taxAmount: number; total: number } {
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const taxAmount = calculateTax(afterDiscount, taxRate)
  const total = afterDiscount + taxAmount + shippingAmount
  return { taxAmount: Number(taxAmount.toFixed(2)), total: Number(total.toFixed(2)) }
}

export function applyCoupon(
  subtotal: number,
  coupon: { discount_type: string; discount_value: number; maximum_discount_amount: number | null }
): number {
  let discount = 0
  if (coupon.discount_type === 'percentage') {
    discount = subtotal * (coupon.discount_value / 100)
  } else {
    discount = coupon.discount_value
  }
  if (coupon.maximum_discount_amount) {
    discount = Math.min(discount, coupon.maximum_discount_amount)
  }
  return Number(Math.min(discount, subtotal).toFixed(2))
}

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function parseSearchParams(searchParams: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  searchParams.forEach((value, key) => {
    if (result[key]) {
      result[key] = Array.isArray(result[key])
        ? [...(result[key] as string[]), value]
        : [result[key] as string, value]
    } else {
      result[key] = value
    }
  })
  return result
}

export function buildQueryString(params: Record<string, string | number | boolean | string[] | undefined>): string {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)))
    } else {
      searchParams.set(key, String(value))
    }
  })
  return searchParams.toString()
}
