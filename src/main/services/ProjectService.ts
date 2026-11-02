import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { Project } from '@shared/entities'
import { ProjectStatus } from '@shared/enums'
import type { ProjectSummary } from '@shared/ipc-types'
import { DEFAULT_CHANNEL_ID } from '../db/migrations/0004_add_channels'
import {
  deleteProjectById,
  findProjectById,
  insertProject,
  listProjectSummaries,
  touchProjectLastOpenedAt,
  updateProjectName,
  updateProjectPipelineSettings,
  updateProjectRunSnapshot,
  updateProjectStatus,
  updateProjectTranscript
} from '../db/queries/projects.queries'

// Defaults mirror context/schema.md `projects` field defaults.
const DEFAULT_AVG_CHARACTERS = 300
// Default variance for the "average ± variance%" SRT splitting range (Phase
// 18, user request — see src/main/pipeline/splitSrt.ts) — matches the
// migration 0005_rename_avg_characters_and_add_variance backfill default.
const DEFAULT_VARIANCE_PERCENT = 30
const DEFAULT_FAKE_DURATION_SEC = 3
// Lowered from 3 to 1 (2026-08-10, user request) — Advanced Settings no
// longer exposes a Max Retry control (AdvancedSettingsPage.tsx), so this is
// now the only place max_retry is ever set; every new project gets exactly 1
// attempt per failing task/batch, no automatic retry. updatePipelineSettings()
// and the DB column stay fully functional (unit tests still use it directly
// to exercise multi-attempt retry/backoff logic) — only the user-facing knob
// is gone.
const DEFAULT_MAX_RETRY = 1
// Raised from 2 to 4 (2026-08-09, user request; allowed range 1-10 since
// 2026-10-21, was 1-5) — only applies to newly created
// projects; an already-open project keeps whatever sceneConcurrency it was
// created with, changeable per-project via Settings > Advanced.
const DEFAULT_SCENE_CONCURRENCY = 4
// How many SRT blocks get grouped into a single Scene/Image Prompt
// Generation request (generateScenePrompt.ts's SCENE_PROMPT_BATCH_SIZE was a
// fixed constant of 10 for every project until 2026-08-10, user request) —
// now per-project, editable via Settings > Advanced > Pipeline Tuning,
// range 1-30 (raised from 1-20 on 2026-10-21, user request). 20 was once
// found too slow historically, hence the 10 default.
const DEFAULT_SCENE_BATCH_SIZE = 10
// Phase 21 — new projects run the full character pipeline by default,
// matching current behavior; "No Characters" (channel.hasCharacters=false)
// is an opt-in choice made at the channel level.
const DEFAULT_HAS_CHARACTERS = true

// No electron import — takes a Database instance so it's usable both from
// the real app (see DatabaseService) and from unit tests (createDatabase(':memory:')).
export class ProjectService {
  constructor(private readonly db: Database.Database) {}

  // `channelId` (Phase 18) — every project belongs to exactly one channel,
  // chosen once and never changed afterward (see context/schema.md's
  // channels table / Changelog Phase 18). The projects:create IPC handler
  // (projects.ipc.ts) always resolves and passes a real one; `channelId` is
  // optional here purely so unit tests constructing ProjectService directly
  // don't all need updating — it falls back to the "Default" channel
  // migration 0004_add_channels seeds into every database (including a
  // fresh createDatabase(':memory:')), which always exists. `defaults`
  // carries that channel's current avgCharacters/variancePercent/
  // fakeDurationSec/sceneConcurrency/sceneBatchSize (resolved by the IPC
  // handler, which has ChannelService) — falls back to schema.md's
  // hard-coded constants only when omitted.
  create(
    input: { name: string; transcript: string; channelId?: string },
    defaults?: {
      avgCharacters?: number
      variancePercent?: number
      fakeDurationSec?: number
      sceneConcurrency?: number
      sceneBatchSize?: number
      hasCharacters?: boolean
    }
  ): Project {
    const name = input.name.trim()
    if (!name) throw new Error('Project name is required')

    const now = new Date().toISOString()
    const project: Project = {
      id: randomUUID(),
      name,
      transcript: input.transcript,
      status: ProjectStatus.DRAFT,
      channelId: input.channelId ?? DEFAULT_CHANNEL_ID,
      selectedModel: null,
      avgCharacters: defaults?.avgCharacters ?? DEFAULT_AVG_CHARACTERS,
      variancePercent: defaults?.variancePercent ?? DEFAULT_VARIANCE_PERCENT,
      fakeDurationSec: defaults?.fakeDurationSec ?? DEFAULT_FAKE_DURATION_SEC,
      maxRetry: DEFAULT_MAX_RETRY,
      sceneConcurrency: defaults?.sceneConcurrency ?? DEFAULT_SCENE_CONCURRENCY,
      sceneBatchSize: defaults?.sceneBatchSize ?? DEFAULT_SCENE_BATCH_SIZE,
      hasCharacters: defaults?.hasCharacters ?? DEFAULT_HAS_CHARACTERS,
      characterDetectionPromptSnapshot: null,
      characterGenerationPromptSnapshot: null,
      sceneGenerationPromptSnapshot: null,
      selectedModelSnapshot: null,
      avgCharactersSnapshot: null,
      fakeDurationSnapshot: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null
    }

    insertProject(this.db, project)
    return project
  }

  // Plain read, no side effects (unlike open(), which bumps last_opened_at
  // and downgrades a stuck `processing` status) — for callers that just need
  // the current row back after a write, e.g. updatePipelineSettings's IPC handler.
  get(id: string): Project | null {
    return findProjectById(this.db, id)
  }

  // `isActuallyRunning` — whether PipelineService currently has a live
  // controller for this project (`PipelineService.isRunning()`), passed in
  // by the caller (projects.ipc.ts, which has both services) since
  // ProjectService itself stays PipelineService-agnostic. Required, not
  // optional/defaulted: a caller navigating to a project *while a queue-
  // triggered run for it is genuinely in flight* must pass `true`, or this
  // downgrades a real, currently-running project's status out from under
  // it (found via a live queue run whose Processing tab got opened —
  // status flipped to `paused` on screen while the run kept going
  // unaffected underneath, since the in-memory controller doesn't care
  // what `projects.status` says).
  open(id: string, isActuallyRunning: boolean): Project | null {
    const project = findProjectById(this.db, id)
    if (!project) return null

    const now = new Date().toISOString()
    touchProjectLastOpenedAt(this.db, id, now)

    // A project left `processing` with nothing actually running it only got
    // that way because the app (or its PipelineService in-memory run
    // controller) went away mid-run — e.g. force-quit. Downgrade to `paused`
    // so it reads as resumable instead of stuck "Processing" forever
    // (plan.md Phase 9 test #3 — force-quit mid-run, then Resume). Gated on
    // `!isActuallyRunning` so this never clobbers a genuinely in-flight run.
    if (project.status === ProjectStatus.PROCESSING && !isActuallyRunning) {
      updateProjectStatus(this.db, id, ProjectStatus.PAUSED, now)
      return { ...project, status: ProjectStatus.PAUSED, lastOpenedAt: now }
    }

    return { ...project, lastOpenedAt: now }
  }

  list(): ProjectSummary[] {
    return listProjectSummaries(this.db)
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Project name is required')
    if (!findProjectById(this.db, id)) throw new Error(`Project not found: ${id}`)
    updateProjectName(this.db, id, trimmed, new Date().toISOString())
  }

  delete(id: string): void {
    deleteProjectById(this.db, id)
  }

  updateTranscript(id: string, transcript: string): void {
    if (!findProjectById(this.db, id)) throw new Error(`Project not found: ${id}`)
    updateProjectTranscript(this.db, id, transcript, new Date().toISOString())
  }

  updateStatus(id: string, status: Project['status']): void {
    if (!findProjectById(this.db, id)) throw new Error(`Project not found: ${id}`)
    updateProjectStatus(this.db, id, status, new Date().toISOString())
  }

  // spec.md 32 — no-op if the project already has a snapshot (set exactly
  // once, on the very first Run). Returns the up-to-date project either way
  // so PipelineService always has the snapshot values to run against.
  applyFirstRunSnapshotIfMissing(
    id: string,
    current: { characterDetection: string; characterGeneration: string; sceneGeneration: string; model: string; avgCharacters: number; fakeDurationSec: number }
  ): Project {
    const project = findProjectById(this.db, id)
    if (!project) throw new Error(`Project not found: ${id}`)
    if (project.characterDetectionPromptSnapshot !== null) return project

    updateProjectRunSnapshot(
      this.db,
      id,
      {
        characterDetectionPromptSnapshot: current.characterDetection,
        characterGenerationPromptSnapshot: current.characterGeneration,
        sceneGenerationPromptSnapshot: current.sceneGeneration,
        selectedModelSnapshot: current.model,
        avgCharactersSnapshot: current.avgCharacters,
        fakeDurationSnapshot: current.fakeDurationSec
      },
      new Date().toISOString()
    )
    return findProjectById(this.db, id) as Project
  }

  // Settings > Advanced > Pipeline Tuning (plan.md Phase 9) — per-project,
  // not AppSettings (see updateProjectPipelineSettings).
  updatePipelineSettings(id: string, settings: { maxRetry: number; sceneConcurrency: number; sceneBatchSize: number }): void {
    if (!findProjectById(this.db, id)) throw new Error(`Project not found: ${id}`)
    if (settings.maxRetry < 1) throw new Error('Max retry must be at least 1.')
    if (settings.sceneConcurrency < 1 || settings.sceneConcurrency > 10) {
      throw new Error('Scene Generation concurrency must be between 1 and 10.')
    }
    if (settings.sceneBatchSize < 1 || settings.sceneBatchSize > 30) {
      throw new Error('Scene Generation batch size must be between 1 and 30.')
    }
    updateProjectPipelineSettings(this.db, id, settings, new Date().toISOString())
  }
}
