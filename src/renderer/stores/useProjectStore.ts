import { create } from 'zustand'
import type { Project } from '@shared/entities'

// UI-only selected-project state (spec.md 3.2) — SQLite via projects.open()
// is the source of truth, this just tracks what the Renderer currently has
// open. Populated by the /projects/:projectId route loader (router.tsx)
// before AppShell/TopBar ever render, so it's non-null for the whole
// project-scoped route tree.
interface ProjectState {
  currentProject: Project | null
  setCurrentProject: (project: Project) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project })
}))
