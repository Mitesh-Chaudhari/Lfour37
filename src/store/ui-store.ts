import { create } from 'zustand'

interface UIStore {
  isCartOpen: boolean
  isMobileMenuOpen: boolean
  isSearchOpen: boolean
  isFiltersOpen: boolean

  openCart: () => void
  closeCart: () => void
  toggleCart: () => void

  openMobileMenu: () => void
  closeMobileMenu: () => void

  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void

  openFilters: () => void
  closeFilters: () => void
  toggleFilters: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  isCartOpen: false,
  isMobileMenuOpen: false,
  isSearchOpen: false,
  isFiltersOpen: false,

  openCart: () => set({ isCartOpen: true }),
  closeCart: () => set({ isCartOpen: false }),
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),

  openMobileMenu: () => set({ isMobileMenuOpen: true }),
  closeMobileMenu: () => set({ isMobileMenuOpen: false }),

  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),

  openFilters: () => set({ isFiltersOpen: true }),
  closeFilters: () => set({ isFiltersOpen: false }),
  toggleFilters: () => set((state) => ({ isFiltersOpen: !state.isFiltersOpen })),
}))
