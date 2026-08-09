import { create } from 'zustand'

// DESIGN.md Layout & Spacing > Responsive Behavior: below the `lg` breakpoint
// the sidebar collapses into a hidden drawer. This tracks whether that
// drawer is currently pulled open — irrelevant at `lg` and above, where
// Sidebar/HomeSidebar force themselves visible regardless of this flag.
interface UiState {
  isSidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  closeSidebar: () => set({ isSidebarOpen: false })
}))
