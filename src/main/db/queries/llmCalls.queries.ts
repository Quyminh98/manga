import type Database from 'better-sqlite3'
import type { LlmCall } from '@shared/entities'

// snake_case row shape as stored in SQLite, mapped to the camelCase LlmCall
// entity — same convention as the other query files.
interface LlmCallRow {
  id: string
  project_id: string
  step: string
  model: string
  status: string
  error: string | null
  duration_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  created_at: string
  updated_at: string
}

function toLlmCall(row: LlmCallRow): LlmCall {
  return {
    id: row.id,
    projectId: row.project_id,
    step: row.step as LlmCall['step'],
    model: row.model,
    status: row.status as LlmCall['status'],
    error: row.error,
    durationMs: row.duration_ms,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function insertLlmCall(db: Database.Database, call: LlmCall): void {
  db.prepare(
    `INSERT INTO llm_calls (
       id, project_id, step, model, status, error, duration_ms,
       prompt_tokens, completion_tokens, total_tokens, created_at, updated_at
     ) VALUES (
       @id, @projectId, @step, @model, @status, @error, @durationMs,
       @promptTokens, @completionTokens, @totalTokens, @createdAt, @updatedAt
     )`
  ).run(call)
}

// Newest first.
export function listLlmCallsByProjectId(db: Database.Database, projectId: string, limit?: number): LlmCall[] {
  const rows = (
    limit === undefined
      ? db.prepare('SELECT * FROM llm_calls WHERE project_id = ? ORDER BY created_at DESC, rowid DESC').all(projectId)
      : db
          .prepare('SELECT * FROM llm_calls WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
          .all(projectId, limit)
  ) as LlmCallRow[]
  return rows.map(toLlmCall)
}

export interface LlmCallAggregateRow {
  key: string
  calls: number
  failed: number
  durationMs: number
  totalTokens: number
}

export interface LlmCallTokenTotals {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function sumLlmCallTokens(db: Database.Database, projectId: string): LlmCallTokenTotals {
  return db
    .prepare(
      `SELECT COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
              COALESCE(SUM(completion_tokens), 0) AS completionTokens,
              COALESCE(SUM(total_tokens), 0) AS totalTokens
         FROM llm_calls WHERE project_id = ?`
    )
    .get(projectId) as LlmCallTokenTotals
}

// Grouped totals for the tab's per-step / per-model tables.
export function aggregateLlmCalls(db: Database.Database, projectId: string, column: 'step' | 'model'): LlmCallAggregateRow[] {
  return db
    .prepare(
      `SELECT ${column} AS key,
              COUNT(*) AS calls,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              COALESCE(SUM(duration_ms), 0) AS durationMs,
              COALESCE(SUM(total_tokens), 0) AS totalTokens
         FROM llm_calls WHERE project_id = ? GROUP BY ${column} ORDER BY calls DESC`
    )
    .all(projectId) as LlmCallAggregateRow[]
}
