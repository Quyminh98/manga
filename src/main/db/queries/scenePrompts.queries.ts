import type Database from 'better-sqlite3'
import type { ScenePrompt } from '@shared/entities'

// snake_case row shape as stored in SQLite, mapped to the camelCase
// ScenePrompt entity — same convention as characterPrompts.queries.ts.
// relevant_character_ids is stored as a JSON array<string> column
// (schema.md), (de)serialized here at the query boundary.
interface ScenePromptRow {
  id: string
  project_id: string
  srt_block_id: string
  block_index: number
  relevant_character_ids: string
  prompt: string | null
  status: ScenePrompt['status']
  attempts: number
  error: string | null
  updated_at: string
}

function toScenePrompt(row: ScenePromptRow): ScenePrompt {
  return {
    id: row.id,
    projectId: row.project_id,
    srtBlockId: row.srt_block_id,
    blockIndex: row.block_index,
    relevantCharacterIds: JSON.parse(row.relevant_character_ids) as string[],
    prompt: row.prompt,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    updatedAt: row.updated_at
  }
}

export function listScenePromptsByProjectId(db: Database.Database, projectId: string): ScenePrompt[] {
  const rows = db
    .prepare('SELECT * FROM scene_prompts WHERE project_id = ? ORDER BY block_index ASC')
    .all(projectId) as ScenePromptRow[]
  return rows.map(toScenePrompt)
}

// spec.md 20 — Regenerate "characters + all scene prompts": wipes every
// Scene Prompt for the project so none of them keep referencing the
// Character Database that just got replaced. The next Generate Image
// Prompts/Run All/Resume regenerates them fresh against the new characters.
export function deleteScenePromptsByProjectId(db: Database.Database, projectId: string): void {
  db.prepare('DELETE FROM scene_prompts WHERE project_id = ?').run(projectId)
}

// Inserts a fresh row for (project_id, srt_block_id) or overwrites the
// existing one — same upsert convention as upsertCharacterPrompt: `id` is
// only used on first insert, so a scene's row (and its Retry history) stays
// stable across every later generate/retry for that SRT block.
export function upsertScenePrompt(db: Database.Database, scenePrompt: ScenePrompt): void {
  db.prepare(
    `INSERT INTO scene_prompts (id, project_id, srt_block_id, block_index, relevant_character_ids, prompt, status, attempts, error, updated_at)
     VALUES (@id, @projectId, @srtBlockId, @blockIndex, @relevantCharacterIds, @prompt, @status, @attempts, @error, @updatedAt)
     ON CONFLICT (project_id, srt_block_id) DO UPDATE SET
       block_index = excluded.block_index,
       relevant_character_ids = excluded.relevant_character_ids,
       prompt = excluded.prompt,
       status = excluded.status,
       attempts = excluded.attempts,
       error = excluded.error,
       updated_at = excluded.updated_at`
  ).run({
    id: scenePrompt.id,
    projectId: scenePrompt.projectId,
    srtBlockId: scenePrompt.srtBlockId,
    blockIndex: scenePrompt.blockIndex,
    relevantCharacterIds: JSON.stringify(scenePrompt.relevantCharacterIds),
    prompt: scenePrompt.prompt,
    status: scenePrompt.status,
    attempts: scenePrompt.attempts,
    error: scenePrompt.error,
    updatedAt: scenePrompt.updatedAt
  })
}
