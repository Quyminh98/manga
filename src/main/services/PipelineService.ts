import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { PipelineTask } from '@shared/entities'
import type { ScenePromptGenerationProgress } from '@shared/ipc-types'
import { ProjectStatus, TaskStatus, TaskType } from '@shared/enums'
import { findProjectById } from '../db/queries/projects.queries'
import { findPipelineTask, listPipelineTasksByProjectId, upsertPipelineTask } from '../db/queries/pipelineTasks.queries'
import { listSrtBlocksByProjectId } from '../db/queries/srtBlocks.queries'
import { listCharacterPromptsByProjectId } from '../db/queries/characterPrompts.queries'
import { validateProjectForRun, type RunPromptSettings } from '@shared/validateRun'
import { CharacterService } from './CharacterService'
import { ExportService } from './ExportService'
import { ProjectService } from './ProjectService'
import { ScenePromptService } from './ScenePromptService'
import { SrtService } from './SrtService'
import type { LlmClient } from '../llm/LlmClient'

// llmClient/model are only actually dereferenced once validateProjectForRun
// has confirmed hasApiKey/model are both present (spec.md 38) — null here
// just means "IPC couldn't resolve one", not "safe to call anyway".
export interface PipelineRuntime {
  llmClient: LlmClient | null
  model: string | null
  promptSettings: RunPromptSettings
  hasApiKey: boolean
  // AppSettings.lastExportFolder, resolved by pipeline.ipc.ts (falls back to
  // the Documents folder — and persists that as the new default — the first
  // time this runs before Settings > General has ever been configured).
  exportFolder: string
}

interface RunController {
  stopRequested: boolean
}

const COARSE_TASK_TYPES = [TaskType.SPLIT_SRT, TaskType.DETECT_CHARACTERS, TaskType.GENERATE_CHARACTER_PROMPTS] as const

const ALREADY_RUNNING_MESSAGE = 'This project is already running.'

// spec.md 36 — Run All orchestration on top of the services already built in
// Phase 5-8 (SrtService/CharacterService/ScenePromptService), instead of
// duplicating their retry/batch/persist logic. Every step is gated ("if not
// already done") so runProject() doubles as Resume (spec.md 19.3) with no
// separate code path — repeating a finished step is a no-op, an unfinished
// one picks up from whatever's already in the DB. Its in-memory `controllers`
// map is what Pause/Cancel signal against — there must be exactly one
// instance for the app's lifetime, shared by pipeline.ipc.ts (manual Run
// All/Resume/Retry) and queue.ipc.ts (queued runs), so a project queued but not yet started and one manually run share
// the exact same "already running" guard. Built once by src/main/container.ts.
export class PipelineService {
  private readonly srtService: SrtService
  private readonly characterService: CharacterService
  private readonly scenePromptService: ScenePromptService
  private readonly projectService: ProjectService
  private readonly exportService: ExportService
  private readonly controllers = new Map<string, RunController>()
  private readonly runningPromises = new Map<string, Promise<unknown>>()

  constructor(private readonly db: Database.Database) {
    this.srtService = new SrtService(db)
    this.characterService = new CharacterService(db)
    this.scenePromptService = new ScenePromptService(db)
    this.projectService = new ProjectService(db)
    this.exportService = new ExportService(db)
  }

  isRunning(projectId: string): boolean {
    return this.controllers.has(projectId)
  }

  // Processing tab (mục 8.6) — the 3 coarse project-level steps as real
  // pipeline_tasks rows (created lazily on first Run), defaulted to a
  // view-only `pending` entry before that so the tab has something to show
  // immediately. GENERATE_SCENE_PROMPT is intentionally not part of this
  // list — the "Scene 001/002/..." breakdown is read straight from
  // scenePrompts.list() (already 1:1 with srt_blocks, already has
  // status/attempts/error), so there's no second copy of that state to keep
  // in sync.
  listTasks(projectId: string): PipelineTask[] {
    const existing = new Map(listPipelineTasksByProjectId(this.db, projectId).map((t) => [t.taskType, t]))
    const now = new Date().toISOString()
    return COARSE_TASK_TYPES.map(
      (taskType) =>
        existing.get(taskType) ?? {
          id: `pending-${taskType}`,
          projectId,
          taskType,
          entityId: null,
          status: TaskStatus.PENDING,
          attempts: 0,
          error: null,
          createdAt: now,
          updatedAt: now
        }
    )
  }

  // spec.md 37 Pause — signals a currently running pipeline to stop pulling
  // new work once whatever's in flight finishes. If nothing is actually
  // running (e.g. the app was restarted since the last run), still marks the
  // project `paused` so it reads as resumable.
  pause(projectId: string): void {
    const controller = this.controllers.get(projectId)
    if (controller) {
      controller.stopRequested = true
      return
    }
    this.projectService.updateStatus(projectId, ProjectStatus.PAUSED)
  }

  // spec.md 37 Cancel — same stop signal as Pause. schema.md's Project.status
  // has no separate "cancelled" value and both leave the project resumable
  // with no data loss, so the only difference is user intent, not behavior.
  cancel(projectId: string): void {
    this.pause(projectId)
  }

  // Delete-while-running (projects.ipc.ts) — requests a stop, same as
  // pause()/cancel(), then actually waits for the in-flight run() call to
  // settle before returning, so the caller can safely delete the project row
  // afterward without racing an in-flight write (upsertPipelineTask/
  // upsertCharacterPrompt/updateStatus) that would otherwise violate a
  // foreign key against a row that no longer exists. No-op if nothing is
  // running for this project.
  async stopAndWait(projectId: string): Promise<void> {
    const controller = this.controllers.get(projectId)
    if (controller) controller.stopRequested = true
    const runningPromise = this.runningPromises.get(projectId)
    if (!runningPromise) return
    try {
      await runningPromise
    } catch {
      // Already handled/logged by whoever originally awaited this run
      // (pipeline.ipc.ts's IPC rejection, or QueueService.drain()'s catch) —
      // stopAndWait() only cares that it has settled, not how.
    }
  }

  // `onSceneProgress` (optional) forwards to ScenePromptService.generate()'s
  // per-batch progress callback, so Run All/queued runs push live Scene
  // Generation progress to the Processing tab.
  runProject(
    projectId: string,
    runtime: PipelineRuntime,
    onTaskUpdate?: (task: PipelineTask) => void,
    onSceneProgress?: (progress: ScenePromptGenerationProgress) => void
  ): Promise<void> {
    // Checked here, not only inside runProjectInternal, so a rejected second
    // call never replaces the in-flight run's entry in runningPromises.
    if (this.controllers.has(projectId)) return Promise.reject(new Error(ALREADY_RUNNING_MESSAGE))
    return this.track(projectId, this.runProjectInternal(projectId, runtime, onTaskUpdate, onSceneProgress))
  }

  // Phase 29 — single-step manual actions (Detect/Generate/Retry from the
  // Characters and Image Prompts tabs) share runProject()'s "already running"
  // guard, so a manual action and Run All never write the same rows at once,
  // and Delete (stopAndWait) waits for a manual action the same way.
  // Pause/Cancel don't interrupt it — it's a single short step.
  runExclusive<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    if (this.controllers.has(projectId)) {
      return Promise.reject(new Error('This project is running — wait for it to finish or pause it first.'))
    }
    this.controllers.set(projectId, { stopRequested: false })
    const promise = (async () => {
      try {
        return await fn()
      } finally {
        this.controllers.delete(projectId)
      }
    })()
    return this.track(projectId, promise)
  }

  // Registers `promise` as "the current run for this project" so
  // stopAndWait() can await it. .finally() returns a *new* derived promise —
  // if nothing ever attaches a handler to it, a rejection propagating through
  // it is reported by Node as a second, separate unhandled rejection even
  // though the original `promise` (returned, awaited by the real caller) is
  // handled just fine. The .catch() only keeps that derived promise quiet.
  private track<T>(projectId: string, promise: Promise<T>): Promise<T> {
    this.runningPromises.set(projectId, promise)
    promise
      .finally(() => {
        if (this.runningPromises.get(projectId) === promise) this.runningPromises.delete(projectId)
      })
      .catch(() => {})
    return promise
  }

  private async runProjectInternal(
    projectId: string,
    runtime: PipelineRuntime,
    onTaskUpdate?: (task: PipelineTask) => void,
    onSceneProgress?: (progress: ScenePromptGenerationProgress) => void
  ): Promise<void> {
    let project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const validationError = validateProjectForRun(project, runtime.promptSettings, runtime.hasApiKey, runtime.model)
    if (validationError) throw new Error(validationError)

    if (this.controllers.has(projectId)) throw new Error(ALREADY_RUNNING_MESSAGE)
    // Validated above — hasApiKey/model both present means these are real.
    const llmClient = runtime.llmClient as LlmClient
    const liveModel = runtime.model as string

    const controller: RunController = { stopRequested: false }
    this.controllers.set(projectId, controller)

    const upsertTask = (taskType: TaskType, status: TaskStatus, attempts: number, error: string | null): void => {
      const existing = findPipelineTask(this.db, projectId, taskType)
      const now = new Date().toISOString()
      const task: PipelineTask = {
        id: existing?.id ?? randomUUID(),
        projectId,
        taskType,
        entityId: null,
        status,
        attempts,
        error,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }
      upsertPipelineTask(this.db, task)
      onTaskUpdate?.(task)
    }

    // Marks a step complete without a redundant DB write/UI event if it's
    // already recorded as such (every gated step below is re-checked on
    // every Resume, so this keeps a no-op Resume from bumping updated_at on
    // 3 rows for nothing).
    const ensureTaskSuccess = (taskType: TaskType): void => {
      const existing = findPipelineTask(this.db, projectId, taskType)
      if (existing?.status === TaskStatus.SUCCESS) return
      upsertTask(taskType, TaskStatus.SUCCESS, existing?.attempts ?? 1, null)
    }

    try {
      // spec.md 32 — snapshot exactly once, on the first Run.
      project = this.projectService.applyFirstRunSnapshotIfMissing(projectId, {
        characterDetection: runtime.promptSettings.characterDetection,
        characterGeneration: runtime.promptSettings.characterGeneration,
        sceneGeneration: runtime.promptSettings.sceneGeneration,
        model: liveModel,
        avgCharacters: project.avgCharacters,
        fakeDurationSec: project.fakeDurationSec
      })

      this.projectService.updateStatus(projectId, ProjectStatus.PROCESSING)

      // Resume must run against the snapshot taken on the first Run, never
      // whatever Settings > Prompts / Vilao API currently say (spec.md 32).
      const snapshotPromptSettings: RunPromptSettings = {
        characterDetection: project.characterDetectionPromptSnapshot as string,
        characterGeneration: project.characterGenerationPromptSnapshot as string,
        sceneGeneration: project.sceneGenerationPromptSnapshot as string
      }
      const snapshotModel = project.selectedModelSnapshot as string

      // Step 1: Split SRT. Gated on "no blocks yet" — spec.md 36's pseudo
      // flow shows this call unconditional, but running it again on every
      // Resume would delete+reinsert srt_blocks with fresh ids and (FK ON
      // DELETE CASCADE) wipe every scene_prompts row already generated.
      // Gating it is what actually satisfies "không mất kết quả đã hoàn
      // thành" for Resume.
      if (listSrtBlocksByProjectId(this.db, projectId).length === 0) {
        upsertTask(TaskType.SPLIT_SRT, TaskStatus.RUNNING, 0, null)
        try {
          this.srtService.split(projectId)
          upsertTask(TaskType.SPLIT_SRT, TaskStatus.SUCCESS, 1, null)
        } catch (err) {
          upsertTask(TaskType.SPLIT_SRT, TaskStatus.FAILED, 1, errorMessage(err))
          throw err
        }
      } else {
        ensureTaskSuccess(TaskType.SPLIT_SRT)
      }

      if (controller.stopRequested) return this.finishAsPaused(projectId)

      // Step 2: Character Detection. Skipped entirely (marked success with no
      // LLM call) for a channel/project with hasCharacters=false (spec.md
      // Phase 21 — transcript with no story characters) — Step 3 below then
      // auto-skips too since characters.length stays 0, and Scene Generation
      // (Step 4) already tolerates 0 characters.
      if (!project.hasCharacters) {
        ensureTaskSuccess(TaskType.DETECT_CHARACTERS)
      } else if (this.characterService.list(projectId).length === 0) {
        upsertTask(TaskType.DETECT_CHARACTERS, TaskStatus.RUNNING, 0, null)
        try {
          await this.characterService.detect(projectId, {
            llmClient,
            promptTemplate: snapshotPromptSettings.characterDetection,
            model: snapshotModel
          })
          upsertTask(TaskType.DETECT_CHARACTERS, TaskStatus.SUCCESS, 1, null)
        } catch (err) {
          upsertTask(TaskType.DETECT_CHARACTERS, TaskStatus.FAILED, 1, errorMessage(err))
          throw err
        }
      } else {
        ensureTaskSuccess(TaskType.DETECT_CHARACTERS)
      }

      if (controller.stopRequested) return this.finishAsPaused(projectId)

      // Step 3: Character Prompt Generation. "Completed" means every
      // character has a `success` character_prompts row — CharacterService
      // itself doesn't skip already-successful characters within a batch it
      // re-runs (Phase 7 batches are atomic as a whole), so a Resume that
      // gets here re-sends every character in any batch that had a failure,
      // not just the failed ones. Accepted V1 tradeoff — Character
      // Generation batches are small (10/request) and this step only runs
      // again when it wasn't fully done, same as every other gate here.
      const characters = this.characterService.list(projectId)
      const characterPromptsDone =
        characters.length > 0 &&
        listCharacterPromptsByProjectId(this.db, projectId).filter((p) => p.status === TaskStatus.SUCCESS).length === characters.length
      if (characters.length > 0 && !characterPromptsDone) {
        upsertTask(TaskType.GENERATE_CHARACTER_PROMPTS, TaskStatus.RUNNING, 0, null)
        try {
          await this.characterService.generatePrompts(projectId, {
            llmClient,
            promptTemplate: snapshotPromptSettings.characterGeneration,
            model: snapshotModel
          })
          const stillFailing = listCharacterPromptsByProjectId(this.db, projectId).some((p) => p.status !== TaskStatus.SUCCESS)
          if (stillFailing) {
            const message = 'One or more Character Prompts failed after exhausting retries.'
            upsertTask(TaskType.GENERATE_CHARACTER_PROMPTS, TaskStatus.FAILED, 1, message)
            throw new Error(message)
          }
          upsertTask(TaskType.GENERATE_CHARACTER_PROMPTS, TaskStatus.SUCCESS, 1, null)
        } catch (err) {
          upsertTask(TaskType.GENERATE_CHARACTER_PROMPTS, TaskStatus.FAILED, 1, errorMessage(err))
          throw err
        }
      } else {
        ensureTaskSuccess(TaskType.GENERATE_CHARACTER_PROMPTS)
      }

      if (controller.stopRequested) return this.finishAsPaused(projectId)

      // Step 4: Scene Prompt Generation — 1:1 with srt_blocks, already
      // resume-aware (skips blocks whose scene_prompts row is `success`) and
      // concurrent up to project.sceneConcurrency.
      await this.scenePromptService.generate(
        projectId,
        { llmClient, promptTemplate: snapshotPromptSettings.sceneGeneration, model: snapshotModel },
        onSceneProgress,
        () => !controller.stopRequested
      )

      if (controller.stopRequested) return this.finishAsPaused(projectId)

      const scenePrompts = this.scenePromptService.list(projectId)
      const hasFailures = scenePrompts.length === 0 || scenePrompts.some((sp) => sp.status !== TaskStatus.SUCCESS)
      this.projectService.updateStatus(projectId, hasFailures ? ProjectStatus.COMPLETED_WITH_ERRORS : ProjectStatus.COMPLETED)

      // spec.md 21/8.7 — write the export bundle now that the run is done,
      // so the Export tab never needs a manual trigger. Best-effort: a write
      // failure (e.g. an unwritable Default Export Folder) shouldn't turn an
      // otherwise-successful run into a failed one.
      try {
        this.exportService.export(projectId, runtime.exportFolder)
      } catch (err) {
        console.error(`Auto-export failed for project ${projectId}:`, err)
      }
    } catch (err) {
      this.projectService.updateStatus(projectId, controller.stopRequested ? ProjectStatus.PAUSED : ProjectStatus.FAILED)
      throw err
    } finally {
      this.controllers.delete(projectId)
    }
  }

  private finishAsPaused(projectId: string): void {
    this.projectService.updateStatus(projectId, ProjectStatus.PAUSED)
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}
