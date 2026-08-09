import type Database from 'better-sqlite3'
import type { SrtBlock } from '@shared/entities'

// snake_case row shape as stored in SQLite, mapped to the camelCase SrtBlock
// entity (src/shared/entities.ts) at the query boundary — same convention as
// projects.queries.ts.
interface SrtBlockRow {
  id: string
  project_id: string
  block_index: number
  start_ms: number
  end_ms: number
  text: string
  character_count: number
  created_at: string
}

function toSrtBlock(row: SrtBlockRow): SrtBlock {
  return {
    id: row.id,
    projectId: row.project_id,
    blockIndex: row.block_index,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text,
    characterCount: row.character_count,
    createdAt: row.created_at
  }
}

export function listSrtBlocksByProjectId(db: Database.Database, projectId: string): SrtBlock[] {
  const rows = db
    .prepare('SELECT * FROM srt_blocks WHERE project_id = ? ORDER BY block_index ASC')
    .all(projectId) as SrtBlockRow[]
  return rows.map(toSrtBlock)
}

export function insertSrtBlocks(db: Database.Database, blocks: SrtBlock[]): void {
  const insert = db.prepare(
    `INSERT INTO srt_blocks (id, project_id, block_index, start_ms, end_ms, text, character_count, created_at)
     VALUES (@id, @projectId, @blockIndex, @startMs, @endMs, @text, @characterCount, @createdAt)`
  )
  for (const block of blocks) {
    insert.run({
      id: block.id,
      projectId: block.projectId,
      blockIndex: block.blockIndex,
      startMs: block.startMs,
      endMs: block.endMs,
      text: block.text,
      characterCount: block.characterCount,
      createdAt: block.createdAt
    })
  }
}

// Re-splitting (transcript edited, user clicks Split SRT again) replaces the
// previous block set wholesale rather than diffing — SrtService wraps this +
// insertSrtBlocks in a transaction.
export function deleteSrtBlocksByProjectId(db: Database.Database, projectId: string): void {
  db.prepare('DELETE FROM srt_blocks WHERE project_id = ?').run(projectId)
}
