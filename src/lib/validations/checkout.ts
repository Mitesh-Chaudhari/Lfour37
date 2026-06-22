import { z } from 'zod'

export const addressSchema = z.object({
  full_name: z.string().min(2, 'Name is required').max(100),
  phone: z.string().min(10, 'Valid phone number is required').max(20),
  address_line1: z.string().min(5, 'Address is required').max(200),
  address_line2: z.string().max(200).optional(),
  city: z.string().min(2, 'City is required').max(100),
  state: z.string().min(2, 'State is required').max(100),
  postal_code: z.string().min(4, 'Postal code is required').max(20),
  country: z.string().length(2, 'Country code required').optional().default('US'),
  is_default: z.boolean().optional().default(false),
})

export const checkoutSchema = z.object({
  address_id: z.string().uuid().optional(),
  full_name: z.string().min(2).max(100),
  phone: z.string().min(10).max(20),
  address_line1: z.string().min(5).max(200),
  address_line2: z.string().max(200).optional(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  postal_code: z.string().min(4).max(20),
  country: z.string().default('India'),
  shipping_method_id: z.string().uuid('Please select a shipping method'),
  coupon_code: z.string().optional(),
  payment_method: z.enum(['razorpay', 'cod']),
  save_address: z.boolean().optional().default(false),
})

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
})

export const couponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').max(50).toUpperCase(),
})

export const productSchema = z.object({
  name: z.string().min(2, 'Name is required').max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().optional(),
  short_description: z.string().max(500).optional(),
  price: z.number().min(0, 'Price must be positive'),
  compare_price: z.preprocess(
    (value) => {
      if (
        value === '' ||
        value === null ||
        value === undefined ||
        Number.isNaN(value)
      ) {
        return undefined
      }

      return Number(value)
    },
    z.number().min(0).optional()
  ),
  cost_price: z.number().min(0).optional(),
  sku: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive', 'draft']),
  is_featured: z.boolean().optional().default(false),
  is_new_arrival: z.boolean().optional().default(false),
  is_trending: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  seo_title: z.string().max(200).optional(),
  seo_description: z.string().max(500).optional(),
  hsn_code: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return undefined
      return value
    },
    z.string().regex(/^\d{4,8}$/, 'HSN code must be 4–8 digits').optional()
  ),
  category_ids: z.array(z.string().uuid()).min(1, 'At least one category required'),
})

export type AddressFormData = z.infer<typeof addressSchema>
export type CheckoutFormData = z.infer<typeof checkoutSchema>
export type ReviewFormData = z.infer<typeof reviewSchema>
export type ProductFormData = z.infer<typeof productSchema>
