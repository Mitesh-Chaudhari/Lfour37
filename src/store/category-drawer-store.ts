import { create } from 'zustand'

interface CategoryDrawerStore {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useCategoryDrawerStore =
  create<CategoryDrawerStore>(
    (set) => ({
      isOpen: false,

      open: () =>
        set({
          isOpen: true,
        }),

      close: () =>
        set({
          isOpen: false,
        }),
    })
  )