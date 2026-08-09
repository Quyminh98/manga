import type Database from 'better-sqlite3'
import type { PipelineTask } from '@shared/entities'

// snake_case row shape as stored in SQLite, mapped to the camelCase
// PipelineTask entity — same convention as the other query files.
interface PipelineTaskRow {
  id: string
  project_id: string
  task_type: string
  entity_id: string | null
  status: string
  attempts: number
  error: string | null
  created_at: string
  updated_at: string
}

function toPipelineTask(row: PipelineTaskRow): PipelineTask {
  return {
    id: row.id,
    projectId: row.project_id,
    taskType: row.task_type as PipelineTask['taskType'],
    entityId: row.entity_id,
    status: row.status as PipelineTask['status'],
    attempts: row.attempts,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listPipelineTasksByProjectId(db: Database.Database, projectId: string): PipelineTask[] {
  const rows = db
    .prepare('SELECT * FROM pipeline_tasks WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as PipelineTaskRow[]
  return rows.map(toPipelineTask)
}

// `entity_id` has no unique constraint in schema.md (see schema.md
// pipeline_tasks notes — polymorphic, no FK), so there is no ON CONFLICT
// target to upsert against. PipelineService only ever tracks one row per
// (project_id, task_type) with entity_id = null (SPLIT_SRT/DETECT_CHARACTERS/
// GENERATE_CHARACTER_PROMPTS — coarse, project-level steps; GENERATE_SCENE_PROMPT
// stays derived live from scene_prompts instead of a second persisted copy,
// see PipelineService), so find-then-update/insert here is equivalent to an
// upsert for that usage without needing a schema change to add a unique index.
export function findPipelineTask(db: Database.Database, projectId: string, taskType: string): PipelineTask | null {
  const row = db
    .prepare('SELECT * FROM pipeline_tasks WHERE project_id = ? AND task_type = ? AND entity_id IS NULL')
    .get(projectId, taskType) as PipelineTaskRow | undefined
  return row ? toPipelineTask(row) : null
}

export function upsertPipelineTask(db: Database.Database, task: PipelineTask): void {
  const existing = findPipelineTask(db, task.projectId, task.taskType)
  if (existing) {
    db.prepare('UPDATE pipeline_tasks SET status = ?, attempts = ?, error = ?, updated_at = ? WHERE id = ?').run(
      task.status,
      task.attempts,
      task.error,
      task.updatedAt,
      existing.id
    )
    return
  }
  db.prepare(
    `INSERT INTO pipeline_tasks (id, project_id, task_type, entity_id, status, attempts, error, created_at, updated_at)
     VALUES (@id, @projectId, @taskType, @entityId, @status, @attempts, @error, @createdAt, @updatedAt)`
  ).run({
    id: task.id,
    projectId: task.projectId,
    taskType: task.taskType,
    entityId: task.entityId,
    status: task.status,
    attempts: task.attempts,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  })
}
