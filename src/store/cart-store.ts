import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartItem, Product, ProductVariant } from '@/types'
import { calculateTax } from '@/lib/utils'

interface CartStore {
  items: CartItem[]
  savedForLater: CartItem[]
  couponCode: string | null
  discountAmount: number
  shippingAmount: number
  shippingMethodId: string | null

  addItem: (product: Product, variant: ProductVariant, quantity?: number) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void
  saveForLater: (variantId: string) => void
  moveToCart: (variantId: string) => void
  removeSavedItem: (variantId: string) => void
  applyCoupon: (code: string, discountAmount: number) => void
  removeCoupon: () => void
  setShipping: (methodId: string, amount: number) => void

  // Computed
  getSubtotal: () => number
  getTaxAmount: () => number
  getTotal: () => number
  getItemCount: () => number
  isInCart: (productId: string, variantId: string) => boolean
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      savedForLater: [],
      couponCode: null,
      discountAmount: 0,
      shippingAmount: 0,
      shippingMethodId: null,

      addItem: (product, variant, quantity = 1) => {
        set((state) => {
          const existingIndex = state.items.findIndex((i) => i.variant_id === variant.id)

          // ✅ Normalize variant with image
          const enrichedVariant = {
            ...variant,
            image_url: variant.image_url || product.images?.[0]?.url || null,
          }

          if (existingIndex >= 0) {
            const items = [...state.items]
            const newQty = items[existingIndex].quantity + quantity

            items[existingIndex] = {
              ...items[existingIndex],
              quantity: Math.min(newQty, variant.stock),
            }

            return { items }
          }

          const newItem: CartItem = {
            id: `${product.id}-${variant.id}`,
            product_id: product.id,
            variant_id: variant.id,
            product,
            variant: enrichedVariant, // ✅ IMPORTANT CHANGE
            quantity: Math.min(quantity, variant.stock),
          }

          return { items: [...state.items, newItem] }
        })
      },

      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((i) => i.variant_id !== variantId),
        }))
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity < 1) {
          get().removeItem(variantId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.variant_id === variantId
              ? { ...i, quantity: Math.min(quantity, i.variant.stock) }
              : i
          ),
        }))
      },

      clearCart: () => set({ items: [], couponCode: null, discountAmount: 0, shippingAmount: 0, shippingMethodId: null }),

      saveForLater: (variantId) => {
        set((state) => {
          const item = state.items.find((i) => i.variant_id === variantId)
          if (!item) return state
          return {
            items: state.items.filter((i) => i.variant_id !== variantId),
            savedForLater: [...state.savedForLater, { ...item, saved_for_later: true }],
          }
        })
      },

      moveToCart: (variantId) => {
        set((state) => {
          const item = state.savedForLater.find((i) => i.variant_id === variantId)
          if (!item) return state
          return {
            savedForLater: state.savedForLater.filter((i) => i.variant_id !== variantId),
            items: [...state.items, { ...item, saved_for_later: false }],
          }
        })
      },

      removeSavedItem: (variantId) => {
        set((state) => ({
          savedForLater: state.savedForLater.filter((i) => i.variant_id !== variantId),
        }))
      },

      applyCoupon: (code, discountAmount) => {
        set({ couponCode: code, discountAmount })
      },

      removeCoupon: () => set({ couponCode: null, discountAmount: 0 }),

      setShipping: (methodId, amount) => {
        set({ shippingMethodId: methodId, shippingAmount: amount })
      },

      getSubtotal: () => {
        return get().items.reduce((sum, item) => {
          const price = item.product.price + item.variant.price_modifier
          return sum + price * item.quantity
        }, 0)
      },

      getTaxAmount: () => {
        const subtotal = get().getSubtotal()
        const afterDiscount = Math.max(0, subtotal - get().discountAmount)
        return calculateTax(afterDiscount)
      },

      getTotal: () => {
        const subtotal = get().getSubtotal()
        const afterDiscount = Math.max(0, subtotal - get().discountAmount)
        return afterDiscount + get().getTaxAmount() + get().shippingAmount
      },

      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

      isInCart: (productId, variantId) =>
        get().items.some((i) => i.product_id === productId && i.variant_id === variantId),
    }),
    {
      name: 'cart-storage',
      partialize: (state) => ({
        items: state.items,
        savedForLater: state.savedForLater,
        couponCode: state.couponCode,
        discountAmount: state.discountAmount,
        shippingAmount: state.shippingAmount,
        shippingMethodId: state.shippingMethodId,
      }),
    }
  )
)
