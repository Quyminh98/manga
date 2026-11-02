import type Database from 'better-sqlite3'
import type { Project } from '@shared/entities'
import type { ProjectStatus } from '@shared/enums'
import type { ProjectSummary } from '@shared/ipc-types'

// snake_case row shape as stored in SQLite, mapped to the camelCase Project
// entity (src/shared/entities.ts) at the query boundary.
interface ProjectRow {
  id: string
  name: string
  transcript: string
  status: string
  channel_id: string
  selected_model: string | null
  avg_characters: number
  variance_percent: number
  fake_duration_sec: number
  max_retry: number
  scene_concurrency: number
  scene_batch_size: number
  has_characters: number
  character_detection_prompt_snapshot: string | null
  character_generation_prompt_snapshot: string | null
  scene_generation_prompt_snapshot: string | null
  selected_model_snapshot: string | null
  avg_characters_snapshot: number | null
  fake_duration_snapshot: number | null
  created_at: string
  updated_at: string
  last_opened_at: string | null
}

interface ProjectSummaryRow extends ProjectRow {
  channel_name: string
  srt_count: number
  character_count: number
  character_prompt_done: number
  scene_prompt_done: number
  failed_task_count: number
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    transcript: row.transcript,
    status: row.status as ProjectStatus,
    channelId: row.channel_id,
    selectedModel: row.selected_model,
    avgCharacters: row.avg_characters,
    variancePercent: row.variance_percent,
    fakeDurationSec: row.fake_duration_sec,
    maxRetry: row.max_retry,
    sceneConcurrency: row.scene_concurrency,
    sceneBatchSize: row.scene_batch_size,
    hasCharacters: row.has_characters === 1,
    characterDetectionPromptSnapshot: row.character_detection_prompt_snapshot,
    characterGenerationPromptSnapshot: row.character_generation_prompt_snapshot,
    sceneGenerationPromptSnapshot: row.scene_generation_prompt_snapshot,
    selectedModelSnapshot: row.selected_model_snapshot,
    avgCharactersSnapshot: row.avg_characters_snapshot,
    fakeDurationSnapshot: row.fake_duration_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at
  }
}

export function insertProject(db: Database.Database, project: Project): void {
  db.prepare(
    `
    INSERT INTO projects (
      id, name, transcript, status, channel_id, selected_model, avg_characters, variance_percent, fake_duration_sec,
      max_retry, scene_concurrency, scene_batch_size, has_characters, character_detection_prompt_snapshot,
      character_generation_prompt_snapshot, scene_generation_prompt_snapshot,
      selected_model_snapshot, avg_characters_snapshot, fake_duration_snapshot,
      created_at, updated_at, last_opened_at
    ) VALUES (
      @id, @name, @transcript, @status, @channelId, @selectedModel, @avgCharacters, @variancePercent, @fakeDurationSec,
      @maxRetry, @sceneConcurrency, @sceneBatchSize, @hasCharacters, @characterDetectionPromptSnapshot,
      @characterGenerationPromptSnapshot, @sceneGenerationPromptSnapshot,
      @selectedModelSnapshot, @avgCharactersSnapshot, @fakeDurationSnapshot,
      @createdAt, @updatedAt, @lastOpenedAt
    )
    `
  ).run({ ...project, hasCharacters: project.hasCharacters ? 1 : 0 })
}

export function findProjectById(db: Database.Database, id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  return row ? toProject(row) : null
}

export function touchProjectLastOpenedAt(db: Database.Database, id: string, timestamp: string): void {
  db.prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?').run(timestamp, id)
}

export function updateProjectName(db: Database.Database, id: string, name: string, updatedAt: string): void {
  db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(name, updatedAt, id)
}

export function updateProjectTranscript(
  db: Database.Database,
  id: string,
  transcript: string,
  updatedAt: string
): void {
  db.prepare('UPDATE projects SET transcript = ?, updated_at = ? WHERE id = ?').run(transcript, updatedAt, id)
}

export function updateProjectStatus(db: Database.Database, id: string, status: ProjectStatus, updatedAt: string): void {
  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id)
}

// spec.md 32 — Prompt Snapshot: set exactly once, on the project's first Run.
// PipelineService only calls this when every *_prompt_snapshot column is
// still null; Resume must always read these columns back, never the live
// AppSettings/selected model, which can drift after the first Run.
export function updateProjectRunSnapshot(
  db: Database.Database,
  id: string,
  snapshot: {
    characterDetectionPromptSnapshot: string
    characterGenerationPromptSnapshot: string
    sceneGenerationPromptSnapshot: string
    selectedModelSnapshot: string
    avgCharactersSnapshot: number
    fakeDurationSnapshot: number
  },
  updatedAt: string
): void {
  db.prepare(
    `UPDATE projects SET
       character_detection_prompt_snapshot = @characterDetectionPromptSnapshot,
       character_generation_prompt_snapshot = @characterGenerationPromptSnapshot,
       scene_generation_prompt_snapshot = @sceneGenerationPromptSnapshot,
       selected_model_snapshot = @selectedModelSnapshot,
       avg_characters_snapshot = @avgCharactersSnapshot,
       fake_duration_snapshot = @fakeDurationSnapshot,
       selected_model = @selectedModelSnapshot,
       updated_at = @updatedAt
     WHERE id = @id`
  ).run({ ...snapshot, updatedAt, id })
}

// Advanced Settings > Pipeline Tuning (plan.md Phase 9) — per-project fields,
// not AppSettings (schema.md doesn't have a global maxRetry/sceneConcurrency;
// see plan.md Phase 4 notes on why maxRetry stays off AppSettings).
// sceneBatchSize added later (2026-08-10, user request) — same per-project
// convention, still 1 UPDATE for all 3 fields together.
export function updateProjectPipelineSettings(
  db: Database.Database,
  id: string,
  settings: { maxRetry: number; sceneConcurrency: number; sceneBatchSize: number },
  updatedAt: string
): void {
  db.prepare('UPDATE projects SET max_retry = ?, scene_concurrency = ?, scene_batch_size = ?, updated_at = ? WHERE id = ?').run(
    settings.maxRetry,
    settings.sceneConcurrency,
    settings.sceneBatchSize,
    updatedAt,
    id
  )
}

export function deleteProjectById(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// srt_count/character_count feed progressPercent — 0 until Phase 5/6 start
// writing srt_blocks/characters, at which point this query needs no changes.
// failed_task_count counts unit-level failures (character_prompts/scene_prompts
// rows stuck at `failed`, spec.md 8.1's "Failed" stat) rather than
// pipeline_tasks — a coarse SPLIT_SRT/DETECT_CHARACTERS pipeline_tasks
// failure halts the run before any character_prompts/scene_prompts rows
// exist, and already surfaces as `projects.status = 'failed'` elsewhere
// (TopBar, Project History badge), so it isn't double-counted here.
export function listProjectSummaries(db: Database.Database): ProjectSummary[] {
  const rows = db
    .prepare(
      `
      SELECT
        p.*,
        ch.name AS channel_name,
        (SELECT COUNT(*) FROM srt_blocks sb WHERE sb.project_id = p.id) AS srt_count,
        (SELECT COUNT(*) FROM characters c WHERE c.project_id = p.id) AS character_count,
        (SELECT COUNT(*) FROM character_prompts cp WHERE cp.project_id = p.id AND cp.status = 'success') AS character_prompt_done,
        (SELECT COUNT(*) FROM scene_prompts sp WHERE sp.project_id = p.id AND sp.status = 'success') AS scene_prompt_done,
        (
          (SELECT COUNT(*) FROM character_prompts cpf WHERE cpf.project_id = p.id AND cpf.status = 'failed') +
          (SELECT COUNT(*) FROM scene_prompts spf WHERE spf.project_id = p.id AND spf.status = 'failed')
        ) AS failed_task_count
      FROM projects p
      JOIN channels ch ON ch.id = p.channel_id
      ORDER BY p.updated_at DESC
      `
    )
    .all() as ProjectSummaryRow[]

  return rows.map((row) => {
    const totalUnits = row.character_count + row.srt_count
    const doneUnits = row.character_prompt_done + row.scene_prompt_done
    const progressPercent = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0

    return {
      ...toProject(row),
      channelName: row.channel_name,
      srtCount: row.srt_count,
      characterCount: row.character_count,
      characterPromptDone: row.character_prompt_done,
      scenePromptDone: row.scene_prompt_done,
      failedTaskCount: row.failed_task_count,
      progressPercent
    }
  })
}
