import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/db/client'
import { ProjectService } from '../../src/main/services/ProjectService'
import { ProjectStatus } from '../../src/shared/enums'

let db: Database.Database
let service: ProjectService

beforeEach(() => {
  db = createDatabase(':memory:')
  service = new ProjectService(db)
})

describe('ProjectService', () => {
  it('creates a project with schema defaults and draft status', () => {
    const project = service.create({ name: '  My Project  ', transcript: 'hello world' })

    expect(project.name).toBe('My Project')
    expect(project.transcript).toBe('hello world')
    expect(project.status).toBe(ProjectStatus.DRAFT)
    expect(project.selectedModel).toBeNull()
    expect(project.avgCharacters).toBe(300)
    expect(project.variancePercent).toBe(30)
    expect(project.fakeDurationSec).toBe(3)
    expect(project.maxRetry).toBe(1)
    expect(project.sceneConcurrency).toBe(4)
    expect(project.sceneBatchSize).toBe(10)
    expect(project.hasCharacters).toBe(true)
    expect(project.id).toBeTruthy()
    expect(project.createdAt).toBe(project.updatedAt)
    expect(project.lastOpenedAt).toBeNull()
  })

  it('rejects a blank project name', () => {
    expect(() => service.create({ name: '   ', transcript: '' })).toThrow('Project name is required')
  })

  it('creates a project using AppSettings defaults when provided', () => {
    const project = service.create(
      { name: 'Custom defaults', transcript: '' },
      { avgCharacters: 500, variancePercent: 15, fakeDurationSec: 5 }
    )

    expect(project.avgCharacters).toBe(500)
    expect(project.variancePercent).toBe(15)
    expect(project.fakeDurationSec).toBe(5)
    // Unrelated schema defaults stay untouched by the override.
    expect(project.maxRetry).toBe(1)
    expect(project.sceneConcurrency).toBe(4)
    expect(project.sceneBatchSize).toBe(10)
  })

  // Phase 18 — every database (including a fresh createDatabase(':memory:'))
  // always has the "Default" channel seeded by migration 0004_add_channels,
  // so create() without an explicit channelId still succeeds and satisfies
  // the channel_id foreign key.
  it('falls back to the migration-seeded "Default" channel when channelId is omitted', () => {
    const project = service.create({ name: 'No explicit channel', transcript: '' })

    const channel = db.prepare('SELECT name FROM channels WHERE id = ?').get(project.channelId) as { name: string } | undefined
    expect(channel?.name).toBe('Default')
  })

  it('uses the given channelId and copies its sceneConcurrency/sceneBatchSize defaults', () => {
    const now = new Date().toISOString()
    const channelId = randomUUID()
    db.prepare(
      `INSERT INTO channels (
         id, name, avg_characters, variance_percent, fake_duration_sec, selected_model,
         character_detection_prompt, character_generation_prompt, scene_generation_prompt,
         scene_concurrency, scene_batch_size, created_at, updated_at
       ) VALUES (?, 'Custom Channel', 800, 20, 6, 'gpt-5.5', 'd', 'g', 's', 2, 15, ?, ?)`
    ).run(channelId, now, now)

    const project = service.create(
      { name: 'In custom channel', transcript: '', channelId },
      { avgCharacters: 800, variancePercent: 20, fakeDurationSec: 6, sceneConcurrency: 2, sceneBatchSize: 15 }
    )

    expect(project.channelId).toBe(channelId)
    expect(project.avgCharacters).toBe(800)
    expect(project.variancePercent).toBe(20)
    expect(project.fakeDurationSec).toBe(6)
    expect(project.sceneConcurrency).toBe(2)
    expect(project.sceneBatchSize).toBe(15)
  })

  it('copies hasCharacters=false from defaults (Phase 21 — "No Characters" channel)', () => {
    const project = service.create({ name: 'No characters project', transcript: '' }, { hasCharacters: false })
    expect(project.hasCharacters).toBe(false)
  })

  it('rejects an unknown channelId (foreign key enforced)', () => {
    expect(() => service.create({ name: 'Bad channel', transcript: '', channelId: randomUUID() })).toThrow()
  })

  it('updateTranscript() persists the new transcript and bumps updated_at', async () => {
    const created = service.create({ name: 'Transcript test', transcript: 'old text' })
    await new Promise((resolve) => setTimeout(resolve, 5))

    service.updateTranscript(created.id, 'new text')

    const reopened = service.open(created.id, false)
    expect(reopened?.transcript).toBe('new text')
    expect(reopened && reopened.updatedAt > created.updatedAt).toBe(true)
  })

  it('updateTranscript() throws for an unknown project id', () => {
    expect(() => service.updateTranscript(randomUUID(), 'text')).toThrow('Project not found')
  })

  it('lists created projects as summaries with zeroed progress', () => {
    service.create({ name: 'A', transcript: '' })
    service.create({ name: 'B', transcript: '' })

    const summaries = service.list()

    expect(summaries).toHaveLength(2)
    expect(summaries.map((p) => p.name).sort()).toEqual(['A', 'B'])
    for (const summary of summaries) {
      expect(summary.channelName).toBe('Default')
      expect(summary.srtCount).toBe(0)
      expect(summary.characterCount).toBe(0)
      expect(summary.characterPromptDone).toBe(0)
      expect(summary.scenePromptDone).toBe(0)
      expect(summary.failedTaskCount).toBe(0)
      expect(summary.progressPercent).toBe(0)
    }
  })

  it('list() computes failedTaskCount/progressPercent from character_prompts + scene_prompts rows (spec.md 8.1)', () => {
    const project = service.create({ name: 'With progress', transcript: '' })
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO characters (
         id, project_id, character_id, name, gender, age_range, appearance, hair,
         clothing, personality, role, unique_features, visual_dna, created_at, updated_at
       ) VALUES (?, ?, '@A', 'A', 'unknown', 'adult', '', '', '', '', 'lead', '', '', ?, ?)`
    ).run(randomUUID(), project.id, now, now)
    db.prepare(
      `INSERT INTO characters (
         id, project_id, character_id, name, gender, age_range, appearance, hair,
         clothing, personality, role, unique_features, visual_dna, created_at, updated_at
       ) VALUES (?, ?, '@B', 'B', 'unknown', 'adult', '', '', '', '', 'lead', '', '', ?, ?)`
    ).run(randomUUID(), project.id, now, now)

    db.prepare(
      `INSERT INTO character_prompts (id, project_id, character_id, prompt, status, attempts, error, updated_at)
       VALUES (?, ?, '@A', 'prompt', 'success', 1, NULL, ?)`
    ).run(randomUUID(), project.id, now)
    db.prepare(
      `INSERT INTO character_prompts (id, project_id, character_id, prompt, status, attempts, error, updated_at)
       VALUES (?, ?, '@B', NULL, 'failed', 3, 'API_ERROR', ?)`
    ).run(randomUUID(), project.id, now)

    const srtBlockId = randomUUID()
    db.prepare(
      `INSERT INTO srt_blocks (id, project_id, block_index, start_ms, end_ms, text, character_count, created_at)
       VALUES (?, ?, 1, 0, 3000, 'hello', 5, ?)`
    ).run(srtBlockId, project.id, now)
    db.prepare(
      `INSERT INTO scene_prompts (id, project_id, srt_block_id, block_index, relevant_character_ids, prompt, status, attempts, error, updated_at)
       VALUES (?, ?, ?, 1, '[]', 'scene prompt', 'success', 1, NULL, ?)`
    ).run(randomUUID(), project.id, srtBlockId, now)

    const [summary] = service.list()

    expect(summary.characterCount).toBe(2)
    expect(summary.srtCount).toBe(1)
    expect(summary.characterPromptDone).toBe(1)
    expect(summary.scenePromptDone).toBe(1)
    // 1 failed character_prompts row + 0 failed scene_prompts rows.
    expect(summary.failedTaskCount).toBe(1)
    // doneUnits=2 (1 char prompt + 1 scene prompt) / totalUnits=3 (2 characters + 1 srt block).
    expect(summary.progressPercent).toBe(67)
  })

  it('open() returns the project and stamps last_opened_at', () => {
    const created = service.create({ name: 'Openable', transcript: '' })
    expect(created.lastOpenedAt).toBeNull()

    const opened = service.open(created.id, false)

    expect(opened).not.toBeNull()
    expect(opened?.id).toBe(created.id)
    expect(opened?.lastOpenedAt).toBeTruthy()
  })

  it('open() returns null for an unknown id', () => {
    expect(service.open(randomUUID(), false)).toBeNull()
  })

  it('rename() persists the new name and updates updated_at', () => {
    const created = service.create({ name: 'Old Name', transcript: '' })

    service.rename(created.id, ' New Name ')

    const [summary] = service.list()
    expect(summary.name).toBe('New Name')
    expect(summary.updatedAt >= created.updatedAt).toBe(true)
  })

  it('rename() throws for an unknown project id', () => {
    expect(() => service.rename(randomUUID(), 'Anything')).toThrow('Project not found')
  })

  it('delete() hard-deletes the project row', () => {
    const created = service.create({ name: 'Doomed', transcript: '' })

    service.delete(created.id)

    expect(service.list()).toHaveLength(0)
    expect(service.open(created.id, false)).toBeNull()
  })

  it('delete() cascades to child tables (srt_blocks, characters, pipeline_tasks)', () => {
    const project = service.create({ name: 'With children', transcript: '' })
    const now = new Date().toISOString()
    const srtBlockId = randomUUID()

    db.prepare(
      `INSERT INTO srt_blocks (id, project_id, block_index, start_ms, end_ms, text, character_count, created_at)
       VALUES (?, ?, 1, 0, 3000, 'hello', 5, ?)`
    ).run(srtBlockId, project.id, now)

    db.prepare(
      `INSERT INTO characters (
         id, project_id, character_id, name, gender, age_range, appearance, hair,
         clothing, personality, role, unique_features, visual_dna, created_at, updated_at
       ) VALUES (?, ?, '@Test', 'Test', 'unknown', 'adult', '', '', '', '', 'lead', '', '', ?, ?)`
    ).run(randomUUID(), project.id, now, now)

    db.prepare(
      `INSERT INTO pipeline_tasks (id, project_id, task_type, entity_id, status, attempts, error, created_at, updated_at)
       VALUES (?, ?, 'SPLIT_SRT', NULL, 'pending', 0, NULL, ?, ?)`
    ).run(randomUUID(), project.id, now, now)

    const countBefore = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

    expect(countBefore('srt_blocks')).toBe(1)
    expect(countBefore('characters')).toBe(1)
    expect(countBefore('pipeline_tasks')).toBe(1)

    service.delete(project.id)

    expect(countBefore('srt_blocks')).toBe(0)
    expect(countBefore('characters')).toBe(0)
    expect(countBefore('pipeline_tasks')).toBe(0)
  })

  it('enforces unique (project_id, block_index) on srt_blocks', () => {
    const project = service.create({ name: 'Unique check', transcript: '' })
    const now = new Date().toISOString()
    const insert = db.prepare(
      `INSERT INTO srt_blocks (id, project_id, block_index, start_ms, end_ms, text, character_count, created_at)
       VALUES (?, ?, 1, 0, 3000, 'hello', 5, ?)`
    )

    insert.run(randomUUID(), project.id, now)

    expect(() => insert.run(randomUUID(), project.id, now)).toThrow()
  })

  // plan.md Phase 9
  it('updateStatus persists the new status and bumps updated_at', () => {
    const project = service.create({ name: 'Status test', transcript: '' })
    service.updateStatus(project.id, ProjectStatus.PROCESSING)
    expect(service.get(project.id)?.status).toBe(ProjectStatus.PROCESSING)
  })

  it('open() downgrades a stuck `processing` status to `paused` when nothing is actually running it (crash/force-quit recovery)', () => {
    const project = service.create({ name: 'Stuck processing', transcript: '' })
    service.updateStatus(project.id, ProjectStatus.PROCESSING)

    const reopened = service.open(project.id, false)

    expect(reopened?.status).toBe(ProjectStatus.PAUSED)
    expect(service.get(project.id)?.status).toBe(ProjectStatus.PAUSED)
  })

  // Found via a live queue-run screenshot: opening a project (e.g. its
  // Processing tab, router.tsx's projectLoader) while it's genuinely being
  // run right now (queue-triggered or otherwise) must NOT clobber its real
  // `processing` status back to `paused` — the caller is responsible for
  // passing `PipelineService.isRunning(id)` in as `isActuallyRunning`.
  it('open() does not downgrade `processing` when the caller says it is actually running', () => {
    const project = service.create({ name: 'Genuinely running', transcript: '' })
    service.updateStatus(project.id, ProjectStatus.PROCESSING)

    const reopened = service.open(project.id, true)

    expect(reopened?.status).toBe(ProjectStatus.PROCESSING)
    expect(service.get(project.id)?.status).toBe(ProjectStatus.PROCESSING)
  })

  it('open() leaves non-processing statuses untouched', () => {
    const project = service.create({ name: 'Draft stays draft', transcript: '' })
    expect(service.open(project.id, false)?.status).toBe(ProjectStatus.DRAFT)
  })

  it('applyFirstRunSnapshotIfMissing sets every *_snapshot field exactly once (spec.md 32)', () => {
    const project = service.create({ name: 'Snapshot', transcript: '' }, { avgCharacters: 250, fakeDurationSec: 4 })

    const snapshot = {
      characterDetection: 'DETECT v1',
      characterGeneration: 'GENERATE v1',
      sceneGeneration: 'SCENE v1',
      model: 'gpt-4o',
      avgCharacters: project.avgCharacters,
      fakeDurationSec: project.fakeDurationSec
    }
    const first = service.applyFirstRunSnapshotIfMissing(project.id, snapshot)
    expect(first.characterDetectionPromptSnapshot).toBe('DETECT v1')
    expect(first.characterGenerationPromptSnapshot).toBe('GENERATE v1')
    expect(first.sceneGenerationPromptSnapshot).toBe('SCENE v1')
    expect(first.selectedModelSnapshot).toBe('gpt-4o')
    expect(first.selectedModel).toBe('gpt-4o')
    expect(first.avgCharactersSnapshot).toBe(250)
    expect(first.fakeDurationSnapshot).toBe(4)

    // A second call (Resume) must not overwrite an existing snapshot.
    const second = service.applyFirstRunSnapshotIfMissing(project.id, { ...snapshot, characterDetection: 'DETECT v2' })
    expect(second.characterDetectionPromptSnapshot).toBe('DETECT v1')
  })

  it('updatePipelineSettings writes maxRetry/sceneConcurrency/sceneBatchSize to the project, validated to schema.md ranges', () => {
    const project = service.create({ name: 'Pipeline tuning', transcript: '' })
    service.updatePipelineSettings(project.id, { maxRetry: 5, sceneConcurrency: 4, sceneBatchSize: 15 })

    const updated = service.get(project.id)!
    expect(updated.maxRetry).toBe(5)
    expect(updated.sceneConcurrency).toBe(4)
    expect(updated.sceneBatchSize).toBe(15)

    expect(() =>
      service.updatePipelineSettings(project.id, { maxRetry: 0, sceneConcurrency: 2, sceneBatchSize: 10 })
    ).toThrow(/at least 1/)
    expect(() =>
      service.updatePipelineSettings(project.id, { maxRetry: 3, sceneConcurrency: 11, sceneBatchSize: 10 })
    ).toThrow(/between 1 and 10/)
    expect(() =>
      service.updatePipelineSettings(project.id, { maxRetry: 3, sceneConcurrency: 4, sceneBatchSize: 0 })
    ).toThrow(/between 1 and 30/)
    expect(() =>
      service.updatePipelineSettings(project.id, { maxRetry: 3, sceneConcurrency: 4, sceneBatchSize: 31 })
    ).toThrow(/between 1 and 30/)
  })
})
