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
let unsubscribeSceneProgress: (() => void) | null = null

// Uses the side-effect-free projects.get() — NOT projects.open(), which also
// downgrades a `processing` project straight back to `paused` (ProjectService.open(),
// meant only for "the app just (re)started and its in-memory run controller
// is gone"). This function gets called on every live task update *during* an
// actual run — with open() here, a queue-triggered run of a project whose
// Processing tab happens to be open would immediately get its own genuine
// `processing` status clobbered back to `paused`, even though the run is
// still very much in flight (bug found via a live queue-run screenshot still
// showing "Paused" next to a "Running" task card).
async function refreshProjectStatus(projectId: string): Promise<void> {
  const project = await appApi.projects.get(projectId)
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
    unsubscribeSceneProgress?.()
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
      // A task update always means this project's status may have changed
      // too — matters for a *queue*-triggered run of a project whose page
      // happens to be open: without this, its TopBar/Processing badge would
      // stay stale (still "Draft"/etc.) until the user navigates away and
      // back, since only run()/pause()/cancel() (renderer-initiated) used to
      // trigger this refresh.
      void refreshProjectStatus(projectId)
    })

    // pipeline.onProgress above only ever fires for the 3 coarse steps
    // (SPLIT_SRT/DETECT_CHARACTERS/GENERATE_CHARACTER_PROMPTS) — Scene
    // Generation, the *last* step, reports progress on a completely separate
    // channel and never touches pipeline_tasks. Without this, a
    // queue-triggered run's final PROCESSING → COMPLETED write (which
    // happens right after Scene Generation's last batch, PipelineService.
    // runProjectInternal()) never gets picked up here, so TopBar/Processing
    // keeps showing "Processing…" forever even once every task is done
    // (found via a finished queue run still showing "Processing…").
    unsubscribeSceneProgress = appApi.scenePrompts.onProgress(() => {
      if (get().subscribedProjectId !== projectId) return
      void refreshProjectStatus(projectId)
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
