import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { Project } from '@shared/entities'
import { ProjectStatus } from '@shared/enums'
import type { ProjectSummary } from '@shared/ipc-types'
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
const DEFAULT_MAX_CHARACTERS = 300
const DEFAULT_FAKE_DURATION_SEC = 3
const DEFAULT_MAX_RETRY = 3
// Raised from 2 to 4 (2026-08-09, user request, still inside the 1-5 range
// spec.md 33/schema.md already allow) — only applies to newly created
// projects; an already-open project keeps whatever sceneConcurrency it was
// created with, changeable per-project via Settings > Advanced.
const DEFAULT_SCENE_CONCURRENCY = 4

// No electron import — takes a Database instance so it's usable both from
// the real app (see DatabaseService) and from unit tests (createDatabase(':memory:')).
export class ProjectService {
  constructor(private readonly db: Database.Database) {}

  // `defaults` carries the current AppSettings (maxCharacters/fakeSrtDurationSec)
  // so new projects pick up whatever the user last configured in Settings >
  // General (plan.md Phase 4) — falls back to schema.md defaults when absent
  // (e.g. unit tests constructing ProjectService directly).
  create(input: { name: string; transcript: string }, defaults?: { maxCharacters?: number; fakeDurationSec?: number }): Project {
    const name = input.name.trim()
    if (!name) throw new Error('Project name is required')

    const now = new Date().toISOString()
    const project: Project = {
      id: randomUUID(),
      name,
      transcript: input.transcript,
      status: ProjectStatus.DRAFT,
      selectedModel: null,
      maxCharacters: defaults?.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
      fakeDurationSec: defaults?.fakeDurationSec ?? DEFAULT_FAKE_DURATION_SEC,
      maxRetry: DEFAULT_MAX_RETRY,
      sceneConcurrency: DEFAULT_SCENE_CONCURRENCY,
      characterDetectionPromptSnapshot: null,
      characterGenerationPromptSnapshot: null,
      sceneGenerationPromptSnapshot: null,
      selectedModelSnapshot: null,
      maxCharactersSnapshot: null,
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

  open(id: string): Project | null {
    const project = findProjectById(this.db, id)
    if (!project) return null

    const now = new Date().toISOString()
    touchProjectLastOpenedAt(this.db, id, now)

    // A project left `processing` only got there because the app (or its
    // PipelineService in-memory run controller) went away mid-run — nothing
    // is actually running it anymore on a fresh app start. Downgrade to
    // `paused` so it reads as resumable instead of stuck "Processing"
    // forever (plan.md Phase 9 test #3 — force-quit mid-run, then Resume).
    if (project.status === ProjectStatus.PROCESSING) {
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
    current: { characterDetection: string; characterGeneration: string; sceneGeneration: string; model: string; maxCharacters: number; fakeDurationSec: number }
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
        maxCharactersSnapshot: current.maxCharacters,
        fakeDurationSnapshot: current.fakeDurationSec
      },
      new Date().toISOString()
    )
    return findProjectById(this.db, id) as Project
  }

  // Settings > Advanced > Pipeline Tuning (plan.md Phase 9) — per-project,
  // not AppSettings (see updateProjectPipelineSettings).
  updatePipelineSettings(id: string, settings: { maxRetry: number; sceneConcurrency: number }): void {
    if (!findProjectById(this.db, id)) throw new Error(`Project not found: ${id}`)
    if (settings.maxRetry < 1) throw new Error('Max retry must be at least 1.')
    if (settings.sceneConcurrency < 1 || settings.sceneConcurrency > 5) {
      throw new Error('Scene Generation concurrency must be between 1 and 5.')
    }
    updateProjectPipelineSettings(this.db, id, settings, new Date().toISOString())
  }
}
