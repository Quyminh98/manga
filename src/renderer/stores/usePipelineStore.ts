import { create } from 'zustand'
import type { PipelineTask } from '@shared/entities'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from './useProjectStore'

// spec.md 8.6/36/37 — shared pipeline run state (spec.md 3.2: UI-only,
// SQLite is the source of truth). A module-level singleton (not tied to any
// one component's lifecycle) so TopBar's Run All and the Processing tab's
// Pause/Resume/Cancel/Retry Failed act on the exact same in-flight run and
// task list regardless of which one is mounted or which one the user clicked
// — there's only ever one pipeline run per project at a time
// (PipelineService.runProject() itself rejects a concurrent call for the
// same project).
interface PipelineState {
  subscribedProjectId: string | null
  tasks: PipelineTask[]
  isRunning: boolean
  error: string | null
  // Subscribes to live task updates for `projectId` (idempotent — re-calling
  // with the same id is a no-op). Call once per project route mount.
  subscribe: (projectId: string) => void
  run: (projectId: string) => Promise<void>
  pause: (projectId: string) => Promise<void>
  cancel: (projectId: string) => Promise<void>
}

let unsubscribeProgress: (() => void) | null = null

async function refreshProjectStatus(projectId: string): Promise<void> {
  const project = await appApi.projects.open(projectId)
  if (project && useProjectStore.getState().currentProject?.id === projectId) {
    useProjectStore.setState({ currentProject: project })
  }
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  subscribedProjectId: null,
  tasks: [],
  isRunning: false,
  error: null,

  subscribe: (projectId) => {
    if (get().subscribedProjectId === projectId) return

    unsubscribeProgress?.()
    set({ subscribedProjectId: projectId, tasks: [], error: null })

    void appApi.pipeline.listTasks(projectId).then((tasks) => {
      if (get().subscribedProjectId === projectId) set({ tasks })
    })

    unsubscribeProgress = appApi.pipeline.onProgress((task) => {
      if (get().subscribedProjectId !== projectId || task.projectId !== projectId) return
      set((state) => {
        const existingIndex = state.tasks.findIndex((t) => t.taskType === task.taskType)
        const tasks = [...state.tasks]
        if (existingIndex === -1) tasks.push(task)
        else tasks[existingIndex] = task
        return { tasks }
      })
    })
  },

  run: async (projectId) => {
    set({ isRunning: true, error: null })
    try {
      await appApi.pipeline.run(projectId)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Pipeline run failed.' })
    } finally {
      set({ isRunning: false })
      await Promise.all([
        appApi.pipeline.listTasks(projectId).then((tasks) => {
          if (get().subscribedProjectId === projectId) set({ tasks })
        }),
        refreshProjectStatus(projectId)
      ])
    }
  },

  // pause()/cancel() just flip an in-memory flag in Main (PipelineService) —
  // they resolve quickly, well before the run() promise above actually
  // settles (that happens once the in-flight batch finishes, spec.md 37).
  // Refresh the project status right away too so the TopBar/Processing UI
  // shows "Pausing…" → paused without waiting on run() to unwind.
  pause: async (projectId) => {
    await appApi.pipeline.pause(projectId)
    await refreshProjectStatus(projectId)
  },

  cancel: async (projectId) => {
    await appApi.pipeline.cancel(projectId)
    await refreshProjectStatus(projectId)
  }
}))
