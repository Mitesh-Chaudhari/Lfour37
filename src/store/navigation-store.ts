import { create } from 'zustand'

interface NavigationStore {
  isNavigating: boolean
  startNavigation: () => void
  endNavigation: () => void
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  isNavigating: false,
  startNavigation: () => set({ isNavigating: true }),
  endNavigation: () => set({ isNavigating: false }),
}))
