import { create } from 'zustand'
import type { ProjectSummary } from '@shared/ipc-types'
import { appApi } from '@renderer/lib/appApi'

// Shared by ProjectsListPage (Home) and QueuePage — both render the same
// underlying project rows, just filtered/ordered differently. Used to be
// separate `useState` per page, which meant a Delete triggered from one
// page never told the other: `deletedIds` only hid the row on whichever
// page the click happened on, and the *other* page's next `refresh()` could
// easily race ahead of the backend delete actually finishing (Delete waits
// for an in-flight run to stop first — DeleteProjectModal), permanently
// showing a project that had, by then, already been deleted. One shared
// store means a Delete from either page is reflected on both immediately.
interface ProjectsListState {
  projects: ProjectSummary[] | null
  deletedIds: Set<string>
  refresh: () => Promise<void>
  markDeleted: (id: string) => void
}

export const useProjectsListStore = create<ProjectsListState>((set) => ({
  projects: null,
  deletedIds: new Set(),

  refresh: async () => {
    const list = await appApi.projects.list()
    set({ projects: list })
  },

  markDeleted: (id) => {
    set((state) => {
      const deletedIds = new Set(state.deletedIds)
      deletedIds.add(id)
      return { deletedIds }
    })
  }
}))
