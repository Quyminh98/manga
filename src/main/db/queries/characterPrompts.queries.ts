import type Database from 'better-sqlite3'
import type { CharacterPrompt } from '@shared/entities'

// snake_case row shape as stored in SQLite, mapped to the camelCase
// CharacterPrompt entity — same convention as characters.queries.ts.
interface CharacterPromptRow {
  id: string
  project_id: string
  character_id: string
  prompt: string | null
  status: CharacterPrompt['status']
  attempts: number
  error: string | null
  updated_at: string
}

function toCharacterPrompt(row: CharacterPromptRow): CharacterPrompt {
  return {
    id: row.id,
    projectId: row.project_id,
    characterId: row.character_id,
    prompt: row.prompt,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    updatedAt: row.updated_at
  }
}

export function listCharacterPromptsByProjectId(db: Database.Database, projectId: string): CharacterPrompt[] {
  const rows = db
    .prepare('SELECT * FROM character_prompts WHERE project_id = ? ORDER BY updated_at ASC')
    .all(projectId) as CharacterPromptRow[]
  return rows.map(toCharacterPrompt)
}

// Inserts a fresh row for (project_id, character_id) or overwrites the
// existing one — `id` is only used on first insert; the ON CONFLICT branch
// deliberately excludes it from the UPDATE SET so a row's id (and its
// original created generation) stays stable across every later
// generate/retry for that character.
// Regenerate (spec.md 20, Phase 12): re-running Character Detection now also
// wipes any character_prompts rows from the previous Character Database —
// they're keyed by (project_id, character_id) with no FK to `characters`
// (business-key relation, not a DB-enforced one), so without this a
// regenerate that changes/renames a Character ID left the old row orphaned
// forever instead of a clean slate.
export function deleteCharacterPromptsByProjectId(db: Database.Database, projectId: string): void {
  db.prepare('DELETE FROM character_prompts WHERE project_id = ?').run(projectId)
}

export function upsertCharacterPrompt(db: Database.Database, characterPrompt: CharacterPrompt): void {
  db.prepare(
    `INSERT INTO character_prompts (id, project_id, character_id, prompt, status, attempts, error, updated_at)
     VALUES (@id, @projectId, @characterId, @prompt, @status, @attempts, @error, @updatedAt)
     ON CONFLICT (project_id, character_id) DO UPDATE SET
       prompt = excluded.prompt,
       status = excluded.status,
       attempts = excluded.attempts,
       error = excluded.error,
       updated_at = excluded.updated_at`
  ).run(characterPrompt)
}
