import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SrtBlock } from '@shared/entities'
import { findProjectById } from '../db/queries/projects.queries'
import { deleteSrtBlocksByProjectId, insertSrtBlocks, listSrtBlocksByProjectId } from '../db/queries/srtBlocks.queries'
import { splitTranscriptToSrtBlocks } from '../pipeline/splitSrt'

// No electron import — same convention as ProjectService, unit-testable via
// createDatabase(':memory:').
export class SrtService {
  constructor(private readonly db: Database.Database) {}

  list(projectId: string): SrtBlock[] {
    return listSrtBlocksByProjectId(this.db, projectId)
  }

  // Non-LLM (spec.md 13/plan.md Phase 5). Re-running replaces the project's
  // existing srt_blocks wholesale, re-numbered from 1 — matches the SPLIT_SRT
  // step in Run All's pseudo flow (spec.md 36), which always re-derives
  // blocks from the current transcript rather than skipping if already done.
  split(projectId: string): SrtBlock[] {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const now = new Date().toISOString()
    const parts = splitTranscriptToSrtBlocks(project.transcript, project.maxCharacters, project.fakeDurationSec)
    const blocks: SrtBlock[] = parts.map((part) => ({
      id: randomUUID(),
      projectId,
      blockIndex: part.blockIndex,
      startMs: part.startMs,
      endMs: part.endMs,
      text: part.text,
      characterCount: part.characterCount,
      createdAt: now
    }))

    const replace = this.db.transaction(() => {
      deleteSrtBlocksByProjectId(this.db, projectId)
      insertSrtBlocks(this.db, blocks)
    })
    replace()

    return blocks
  }
}
