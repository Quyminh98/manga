import { create } from 'zustand'
import type { QueueItem } from '@shared/ipc-types'
import { appApi } from '@renderer/lib/appApi'

// Run queue — a module-level singleton subscription (mirrors
// usePipelineStore.ts) so ProjectsListPage, QueuePage, TopBar and
// ProcessingPage all read the exact same live queue state regardless of
// which of them is mounted, with only one queue:updateEvent listener alive
// at a time.
interface QueueState {
  items: QueueItem[]
  subscribed: boolean
  subscribe: () => void
  add: (projectId: string) => Promise<void>
  remove: (projectId: string) => Promise<void>
}

let unsubscribeUpdate: (() => void) | null = null

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  subscribed: false,

  subscribe: () => {
    // Refetch on every call (every page mount) — `items` otherwise only ever
    // lives off queue:updateEvent pushes since the first-ever subscribe(),
    // with no way to self-correct if a push is ever missed (observed during
    // dev with Vite HMR reloading the renderer bundle mid-run). The
    // `subscribed` guard still limits the actual onUpdate listener to one
    // live registration at a time.
    void appApi.queue.list().then((items) => set({ items }))

    if (get().subscribed) return
    set({ subscribed: true })

    unsubscribeUpdate?.()
    unsubscribeUpdate = appApi.queue.onUpdate((items) => set({ items }))
  },

  add: async (projectId) => {
    await appApi.queue.add(projectId)
  },

  remove: async (projectId) => {
    await appApi.queue.remove(projectId)
  }
}))
