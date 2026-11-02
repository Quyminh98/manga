import type { PipelineTask } from '@shared/entities'

export type QueueRunProjectFn = (projectId: string, onTaskUpdate: (task: PipelineTask) => void) => Promise<void>

export type QueueItemStatus = 'queued' | 'running'

export interface QueueListItem {
  projectId: string
  status: QueueItemStatus
}

export interface QueueCallbacks {
  onQueueChange?: (items: QueueListItem[]) => void
  onTaskUpdate?: (task: PipelineTask) => void
}

// Runs at most one project at a time, strictly in FIFO order — a thin
// sequencer on top of PipelineService.runProject() (injected as
// `runProject`, not a concrete PipelineService, so this stays Electron-free
// and unit-testable with a fake). In-memory only, no persistence: the user
// confirmed the queue doesn't need to survive an app restart.
//
// A run failing (rejects) must NOT stop the queue — same "best-effort, log
// and continue" pattern PipelineService.runProject() itself uses for its own
// auto-export step. The caller is responsible for making runProject() never
// reject for reasons that should actually halt everything (it currently
// never does — see queue.ipc.ts).
export class QueueService {
  private queued: string[] = []
  private currentProjectId: string | null = null
  private draining = false

  constructor(
    private readonly runProject: QueueRunProjectFn,
    private readonly callbacks: QueueCallbacks = {}
  ) {}

  list(): QueueListItem[] {
    const running: QueueListItem[] = this.currentProjectId ? [{ projectId: this.currentProjectId, status: 'running' }] : []
    return [...running, ...this.queued.map((projectId): QueueListItem => ({ projectId, status: 'queued' }))]
  }

  // No-op if already the running item or already queued — Add to Queue is
  // idempotent from the Renderer's point of view.
  add(projectId: string): void {
    if (projectId === this.currentProjectId || this.queued.includes(projectId)) return
    this.queued.push(projectId)
    this.emitQueueChange()
    void this.drain()
  }

  // Only removes a not-yet-started item — `currentProjectId` is never in
  // `queued`, so calling this for the running item is correctly a no-op
  // (the Renderer shouldn't offer a Remove control for that row).
  remove(projectId: string): boolean {
    const index = this.queued.indexOf(projectId)
    if (index === -1) return false
    this.queued.splice(index, 1)
    this.emitQueueChange()
    return true
  }

  // `draining` guards re-entrancy: add() called while this while-loop is
  // mid-await on a run just pushes to `queued` and returns from its own
  // drain() call immediately (this one's already running) — the loop below
  // picks the new item up on its next iteration, no extra locking needed.
  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      let next: string | undefined
      while ((next = this.queued.shift())) {
        this.currentProjectId = next
        this.emitQueueChange()
        try {
          await this.runProject(next, (task) => this.callbacks.onTaskUpdate?.(task))
        } catch (err) {
          console.error(`Queue: run failed for project ${next}:`, err)
        } finally {
          this.currentProjectId = null
          this.emitQueueChange()
        }
      }
    } finally {
      this.draining = false
    }
  }

  private emitQueueChange(): void {
    this.callbacks.onQueueChange?.(this.list())
  }
}
