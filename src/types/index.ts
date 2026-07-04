export type UserRole = 'customer' | 'admin' | 'super_admin'
export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'return_requested' | 'return_initiated' | 'returned' | 'exchange_initiated' | 'exchanged'
export type PaymentMethod = 'stripe' | 'crypto' | 'razorpay' | 'cod'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'
export type CryptoNetwork = 'ethereum' | 'polygon' | 'bsc' | 'base'
export type CryptoToken = 'USDT' | 'USDC'
export type DiscountType = 'percentage' | 'fixed'
export type ReviewStatus = 'pending' | 'approved' | 'rejected'
export type ProductStatus = 'active' | 'inactive' | 'draft'

export interface User {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  role: UserRole
  is_suspended: boolean
  email_verified: boolean
  newsletter_subscribed: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  parent_id: string | null
  sort_order: number
  is_active: boolean
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
  children?: Category[]
  parent?: Category
}

export interface ProductImage {
  url: string
  alt?: string
  position: number
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  short_description: string | null
  price: number
  compare_price: number | null
  cost_price: number | null
  sku: string | null
  barcode: string | null
  hsn_code: string | null
  status: ProductStatus
  is_featured: boolean
  is_new_arrival: boolean
  is_trending: boolean
  weight: number | null
  images: ProductImage[]
  tags: string[]
  seo_title: string | null
  seo_description: string | null
  seo_keywords: string[]
  average_rating: number
  review_count: number
  total_sold: number
  created_at: string
  updated_at: string
  variants?: ProductVariant[]
  categories?: Category[]
  primary_category_label?: string
  primary_category_slug?: string
}

export interface ProductVariant {
  id: string
  product_id: string
  size: string
  color: string
  color_group: string
  color_hex: string | null
  stock: number
  price_modifier: number
  sku: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Address {
  id: string
  user_id: string
  full_name: string
  phone: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ShippingMethod {
  id: string
  name: string
  description: string | null
  price: number
  estimated_days_min: number
  estimated_days_max: number
  is_active: boolean
  created_at: string
}

export interface Coupon {
  id: string
  code: string
  description: string | null
  discount_type: DiscountType
  discount_value: number
  minimum_order_amount: number
  maximum_discount_amount: number | null
  usage_limit: number | null
  usage_count: number
  is_active: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface CartItem {
  id: string
  product_id: string
  variant_id: string
  product: Product
  variant: ProductVariant
  quantity: number
  saved_for_later?: boolean
}

export interface Order {
  id: string
  order_number: string
  user_id: string
  status: OrderStatus
  subtotal: number
  discount_amount: number
  tax_amount: number
  shipping_amount: number
  total: number
  coupon_id: string | null
  coupon_code: string | null
  shipping_method_id: string | null
  shipping_address: Address
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  notes: string | null
  tracking_number: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  items?: OrderItem[]
  payment?: Payment
  user?: User
  shipping_method?: ShippingMethod
  delhivery_shipment?: DelhiveryShipment | null
}

export interface DelhiveryShipment {
  id: string
  order_id: string
  awb: string | null
  status: string
  status_code: string | null
  status_type: string | null
  instructions: string | null
  expected_delivery_date: string | null
  last_event_at: string | null
  last_synced_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  events?: DelhiveryTrackingEvent[]
}

export interface DelhiveryTrackingEvent {
  id: string
  shipment_id: string
  status: string
  status_code: string | null
  status_type: string | null
  location: string | null
  instructions: string | null
  occurred_at: string | null
  created_at: string
}

export interface DelhiveryReversePickup {
  id: string
  order_id: string
  order_item_id: string
  pickup_type: 'return' | 'exchange'
  awb: string | null
  exchange_forward_awb: string | null
  status: string
  status_code: string | null
  status_type: string | null
  instructions: string | null
  last_event_at: string | null
  last_synced_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  variant_id: string | null
  product_name: string
  product_image: string | null
  variant_size: string | null
  variant_color: string | null
  quantity: number
  unit_price: number
  total_price: number
  hsn_code: string | null
  created_at: string
  product?: Product
}

export interface CategoryHsnMapping {
  id: string
  category_id: string
  hsn_code: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  order_id: string
  payment_method: PaymentMethod
  status: PaymentStatus
  amount: number
  currency: string
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  refund_id: string | null
  refunded_amount: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CryptoTransaction {
  id: string
  order_id: string
  payment_id: string | null
  network: CryptoNetwork
  token: CryptoToken
  from_address: string
  to_address: string
  transaction_hash: string | null
  amount: number
  usd_amount: number
  status: PaymentStatus
  block_number: number | null
  confirmations: number
  required_confirmations: number
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  product_id: string
  user_id: string
  order_id: string | null
  rating: number
  title: string | null
  body: string | null
  status: ReviewStatus
  is_verified_purchase: boolean
  helpful_count: number
  created_at: string
  updated_at: string
  user?: Pick<User, 'id' | 'full_name' | 'avatar_url'>
}

export interface WishlistItem {
  id: string
  user_id: string
  product_id: string
  created_at: string
  product?: Product
}

export interface AnalyticsEvent {
  id: string
  event_type: string
  user_id: string | null
  session_id: string | null
  product_id: string | null
  order_id: string | null
  properties: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface PromotionalBanner {
  id: string
  title: string
  subtitle: string | null
  image_url: string | null
  link_url: string | null
  button_text: string | null
  is_active: boolean
  sort_order: number
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface ApiError {
  error: string
  details?: string
  status?: number
}

// Product filter types
export interface ProductFilters {
  category?: string
  minPrice?: number
  maxPrice?: number
  sizes?: string[]
  colors?: string[]
  minRating?: number
  inStock?: boolean
  search?: string
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'rating'
  page?: number
  perPage?: number
}

// Checkout types
export interface CheckoutFormData {
  address_id?: string
  full_name: string
  phone: string
  address_line1: string
  address_line2?: string
  city: string
  state: string
  postal_code: string
  country: string
  shipping_method_id: string
  coupon_code?: string
  payment_method: PaymentMethod
  save_address?: boolean
}

// Admin analytics types
export interface AnalyticsSummary {
  total_revenue: number
  total_orders: number
  total_users: number
  conversion_rate: number
  revenue_change: number
  orders_change: number
  users_change: number
}

export interface RevenueDataPoint {
  date: string
  revenue: number
  orders: number
}

export interface TopProduct {
  product_id: string
  product_name: string
  total_sold: number
  total_revenue: number
}

// Crypto payment types
export interface CryptoPaymentConfig {
  network: CryptoNetwork
  token: CryptoToken
  contractAddress: string
  merchantAddress: string
  amount: number
  orderId: string
}

export interface NetworkConfig {
  id: number
  name: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorers: string[]
}
