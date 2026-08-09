import type Database from 'better-sqlite3'
import type { Character } from '@shared/entities'

// snake_case row shape as stored in SQLite, mapped to the camelCase Character
// entity (src/shared/entities.ts) at the query boundary — same convention as
// projects.queries.ts / srtBlocks.queries.ts.
interface CharacterRow {
  id: string
  project_id: string
  character_id: string
  name: string
  gender: string
  age_range: string
  appearance: string
  hair: string
  clothing: string
  personality: string
  role: string
  unique_features: string
  visual_dna: string
  created_at: string
  updated_at: string
}

function toCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    projectId: row.project_id,
    characterId: row.character_id,
    name: row.name,
    gender: row.gender,
    ageRange: row.age_range,
    appearance: row.appearance,
    hair: row.hair,
    clothing: row.clothing,
    personality: row.personality,
    role: row.role,
    uniqueFeatures: row.unique_features,
    visualDna: row.visual_dna,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listCharactersByProjectId(db: Database.Database, projectId: string): Character[] {
  const rows = db
    .prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as CharacterRow[]
  return rows.map(toCharacter)
}

// Used by CharacterService.retryPrompt (Phase 7) to look up the single
// character being regenerated without loading the whole project's list.
export function findCharacterByProjectAndCharacterId(
  db: Database.Database,
  projectId: string,
  characterId: string
): Character | null {
  const row = db
    .prepare('SELECT * FROM characters WHERE project_id = ? AND character_id = ?')
    .get(projectId, characterId) as CharacterRow | undefined
  return row ? toCharacter(row) : null
}

export function insertCharacters(db: Database.Database, characters: Character[]): void {
  const insert = db.prepare(
    `INSERT INTO characters (
      id, project_id, character_id, name, gender, age_range, appearance, hair,
      clothing, personality, role, unique_features, visual_dna, created_at, updated_at
    ) VALUES (
      @id, @projectId, @characterId, @name, @gender, @ageRange, @appearance, @hair,
      @clothing, @personality, @role, @uniqueFeatures, @visualDna, @createdAt, @updatedAt
    )`
  )
  for (const character of characters) insert.run(character)
}

// Re-running Character Detection (retry, or a later Regenerate in Phase 12)
// replaces the previous character set wholesale rather than diffing — same
// convention as srtBlocks.queries.ts's deleteSrtBlocksByProjectId, wrapped in
// a transaction by the caller (CharacterService).
export function deleteCharactersByProjectId(db: Database.Database, projectId: string): void {
  db.prepare('DELETE FROM characters WHERE project_id = ?').run(projectId)
}
