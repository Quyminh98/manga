import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migration0001Init } from '../../src/main/db/migrations/0001_init'
import { migration0002NormalizeScenePromptNewlines } from '../../src/main/db/migrations/0002_normalize_scene_prompt_newlines'
import { migration0003AddSceneBatchSize } from '../../src/main/db/migrations/0003_add_scene_batch_size'
import { migration0004AddChannels } from '../../src/main/db/migrations/0004_add_channels'
import { migration0005RenameAvgCharactersAndAddVariance } from '../../src/main/db/migrations/0005_rename_avg_characters_and_add_variance'
import { migration0006AddHasCharacters } from '../../src/main/db/migrations/0006_add_has_characters'
import { migration0007AddSceneGenerationPromptNoCharacters } from '../../src/main/db/migrations/0007_add_scene_generation_prompt_no_characters'
import { DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT } from '../../src/shared/prompts'

// Applies only 0001 (tables) directly, without 0002 — so a row with real
// newlines can be inserted first, then 0002's SQL run explicitly against it.
// runMigrations()/createDatabase() would apply both in one shot on a fresh
// DB, before there's ever data to clean — this is the only way to actually
// exercise 0002's UPDATE logic against pre-existing "dirty" rows, which is
// the exact real-world case it exists for (a DB file that already has scene
// prompts generated before generateScenePrompt.ts's normalizePromptText()
// fix, per spec.md 30 rule 10).
function makeDbWithOldSchema(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(migration0001Init.sql)
  return db
}

function insertMinimalProjectAndBlock(db: Database.Database): { projectId: string; srtBlockId: string } {
  const now = new Date().toISOString()
  const projectId = randomUUID()
  const srtBlockId = randomUUID()
  db.prepare(
    `INSERT INTO projects (
       id, name, transcript, status, max_characters, fake_duration_sec, max_retry, scene_concurrency, created_at, updated_at
     ) VALUES (?, 'P', '', 'draft', 300, 3, 3, 4, ?, ?)`
  ).run(projectId, now, now)
  db.prepare(
    `INSERT INTO srt_blocks (id, project_id, block_index, start_ms, end_ms, text, character_count, created_at)
     VALUES (?, ?, 1, 0, 3000, 'hello', 5, ?)`
  ).run(srtBlockId, projectId, now)
  return { projectId, srtBlockId }
}

function insertScenePrompt(db: Database.Database, projectId: string, srtBlockId: string, prompt: string | null): void {
  db.prepare(
    `INSERT INTO scene_prompts (id, project_id, srt_block_id, block_index, relevant_character_ids, prompt, status, attempts, error, updated_at)
     VALUES (?, ?, ?, 1, '[]', ?, 'success', 1, NULL, ?)`
  ).run(randomUUID(), projectId, srtBlockId, prompt, new Date().toISOString())
}

describe('migration 0002_normalize_scene_prompt_newlines', () => {
  it('replaces \\n and \\r\\n between panels with a single space', () => {
    const db = makeDbWithOldSchema()
    const { projectId, srtBlockId } = insertMinimalProjectAndBlock(db)
    insertScenePrompt(
      db,
      projectId,
      srtBlockId,
      'Panel 1 (top, wide): a hero stands tall.\n\nPanel 2 (bottom, small): rain falls.\r\nPremium Chinese Manhua style --ar 16:9'
    )

    db.exec(migration0002NormalizeScenePromptNewlines.sql)

    const row = db.prepare('SELECT prompt FROM scene_prompts').get() as { prompt: string }
    expect(row.prompt).toBe(
      'Panel 1 (top, wide): a hero stands tall. Panel 2 (bottom, small): rain falls. Premium Chinese Manhua style --ar 16:9'
    )
    expect(row.prompt).not.toContain('\n')
    expect(row.prompt).not.toContain('\r')
  })

  it('leaves an already single-line prompt untouched', () => {
    const db = makeDbWithOldSchema()
    const { projectId, srtBlockId } = insertMinimalProjectAndBlock(db)
    insertScenePrompt(db, projectId, srtBlockId, 'Panel 1 (top, wide): already clean. --ar 16:9')

    db.exec(migration0002NormalizeScenePromptNewlines.sql)

    const row = db.prepare('SELECT prompt FROM scene_prompts').get() as { prompt: string }
    expect(row.prompt).toBe('Panel 1 (top, wide): already clean. --ar 16:9')
  })

  it('does not crash on a NULL prompt (failed/pending scene)', () => {
    const db = makeDbWithOldSchema()
    const { projectId, srtBlockId } = insertMinimalProjectAndBlock(db)
    insertScenePrompt(db, projectId, srtBlockId, null)

    expect(() => db.exec(migration0002NormalizeScenePromptNewlines.sql)).not.toThrow()
    const row = db.prepare('SELECT prompt FROM scene_prompts').get() as { prompt: string | null }
    expect(row.prompt).toBeNull()
  })
})

describe('migration 0003_add_scene_batch_size', () => {
  it('backfills existing projects (inserted before the column existed) to 10, matching the old fixed constant', () => {
    const db = makeDbWithOldSchema()
    const { projectId } = insertMinimalProjectAndBlock(db)

    db.exec(migration0003AddSceneBatchSize.sql)

    const row = db.prepare('SELECT scene_batch_size FROM projects WHERE id = ?').get(projectId) as {
      scene_batch_size: number
    }
    expect(row.scene_batch_size).toBe(10)
  })

  it('lets a fresh insert after the migration set its own value, not just the backfill default', () => {
    const db = makeDbWithOldSchema()
    db.exec(migration0003AddSceneBatchSize.sql)

    const projectId = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO projects (
         id, name, transcript, status, max_characters, fake_duration_sec, max_retry, scene_concurrency,
         scene_batch_size, created_at, updated_at
       ) VALUES (?, 'P2', '', 'draft', 300, 3, 1, 4, 15, ?, ?)`
    ).run(projectId, now, now)

    const row = db.prepare('SELECT scene_batch_size FROM projects WHERE id = ?').get(projectId) as {
      scene_batch_size: number
    }
    expect(row.scene_batch_size).toBe(15)
  })
})

describe('migration 0004_add_channels', () => {
  it('creates a single "Default" channel and backfills channel_id for existing projects', () => {
    const db = makeDbWithOldSchema()
    const { projectId } = insertMinimalProjectAndBlock(db)

    db.exec(migration0004AddChannels.sql)

    const channels = db.prepare('SELECT id, name FROM channels').all() as Array<{ id: string; name: string }>
    expect(channels).toHaveLength(1)
    expect(channels[0].name).toBe('Default')

    const projectRow = db.prepare('SELECT channel_id FROM projects WHERE id = ?').get(projectId) as { channel_id: string }
    expect(projectRow.channel_id).toBe(channels[0].id)
  })

  it('lets a fresh insert after the migration pick its own channel_id, not just the backfill default', () => {
    const db = makeDbWithOldSchema()
    db.exec(migration0004AddChannels.sql)
    const now = new Date().toISOString()

    const customChannelId = randomUUID()
    db.prepare(
      `INSERT INTO channels (
         id, name, max_characters, fake_duration_sec, selected_model,
         character_detection_prompt, character_generation_prompt, scene_generation_prompt,
         scene_concurrency, scene_batch_size, created_at, updated_at
       ) VALUES (?, 'Custom', 500, 5, NULL, 'd', 'g', 's', 3, 8, ?, ?)`
    ).run(customChannelId, now, now)

    const projectId = randomUUID()
    db.prepare(
      `INSERT INTO projects (
         id, name, transcript, status, channel_id, max_characters, fake_duration_sec, max_retry, scene_concurrency, created_at, updated_at
       ) VALUES (?, 'P2', '', 'draft', ?, 300, 3, 1, 4, ?, ?)`
    ).run(projectId, customChannelId, now, now)

    const row = db.prepare('SELECT channel_id FROM projects WHERE id = ?').get(projectId) as { channel_id: string }
    expect(row.channel_id).toBe(customChannelId)
  })

  it('rejects a project referencing a nonexistent channel (foreign key enforced)', () => {
    const db = makeDbWithOldSchema()
    db.exec(migration0004AddChannels.sql)
    const now = new Date().toISOString()

    expect(() =>
      db
        .prepare(
          `INSERT INTO projects (
             id, name, transcript, status, channel_id, max_characters, fake_duration_sec, max_retry, scene_concurrency, created_at, updated_at
           ) VALUES (?, 'Bad', '', 'draft', ?, 300, 3, 1, 4, ?, ?)`
        )
        .run(randomUUID(), randomUUID(), now, now)
    ).toThrow()
  })

  it('blocks deleting a channel that still has a project referencing it (no cascade)', () => {
    const db = makeDbWithOldSchema()
    insertMinimalProjectAndBlock(db)
    db.exec(migration0004AddChannels.sql)

    const channel = db.prepare('SELECT id FROM channels').get() as { id: string }
    expect(() => db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id)).toThrow()
  })
})

// Schema state right before 0005 runs: 0001 (tables incl. max_characters/
// max_characters_snapshot) + 0004 (channels table + channel_id, channels
// itself still has max_characters at this point) — 0002/0003 aren't
// prerequisites for anything 0005 touches, so skipped for a minimal chain.
function makeDbThroughChannels(): Database.Database {
  const db = makeDbWithOldSchema()
  db.exec(migration0004AddChannels.sql)
  return db
}

describe('migration 0005_rename_avg_characters_and_add_variance', () => {
  it('renames projects.max_characters/max_characters_snapshot, preserving existing data, and backfills variance_percent to 30', () => {
    const db = makeDbThroughChannels()
    const { projectId } = insertMinimalProjectAndBlock(db)

    db.exec(migration0005RenameAvgCharactersAndAddVariance.sql)

    const row = db.prepare('SELECT avg_characters, variance_percent FROM projects WHERE id = ?').get(projectId) as {
      avg_characters: number
      variance_percent: number
    }
    expect(row.avg_characters).toBe(300) // preserved from the old max_characters value
    expect(row.variance_percent).toBe(30)
  })

  it('renames channels.max_characters and backfills channels.variance_percent to 30', () => {
    const db = makeDbThroughChannels()
    const defaultChannel = db.prepare('SELECT id FROM channels').get() as { id: string }

    db.exec(migration0005RenameAvgCharactersAndAddVariance.sql)

    const row = db.prepare('SELECT avg_characters, variance_percent FROM channels WHERE id = ?').get(defaultChannel.id) as {
      avg_characters: number
      variance_percent: number
    }
    expect(row.avg_characters).toBe(300)
    expect(row.variance_percent).toBe(30)
  })

  it('lets a fresh insert after the migration set its own avg_characters/variance_percent', () => {
    const db = makeDbThroughChannels()
    db.exec(migration0005RenameAvgCharactersAndAddVariance.sql)
    const now = new Date().toISOString()

    const channel = db.prepare('SELECT id FROM channels').get() as { id: string }
    const projectId = randomUUID()
    db.prepare(
      `INSERT INTO projects (
         id, name, transcript, status, channel_id, avg_characters, variance_percent, fake_duration_sec,
         max_retry, scene_concurrency, created_at, updated_at
       ) VALUES (?, 'P2', '', 'draft', ?, 120, 45, 3, 1, 4, ?, ?)`
    ).run(projectId, channel.id, now, now)

    const row = db.prepare('SELECT avg_characters, variance_percent FROM projects WHERE id = ?').get(projectId) as {
      avg_characters: number
      variance_percent: number
    }
    expect(row.avg_characters).toBe(120)
    expect(row.variance_percent).toBe(45)
  })
})

// Schema state right before 0006 runs: 0001 + 0004 (channels) + 0005 (rename/
// variance) — 0006 doesn't touch anything 0002/0003 add, so skipped here too.
function makeDbThroughVariance(): Database.Database {
  const db = makeDbThroughChannels()
  db.exec(migration0005RenameAvgCharactersAndAddVariance.sql)
  return db
}

describe('migration 0006_add_has_characters', () => {
  it('backfills existing channels and projects to has_characters=1 (true), preserving current behavior', () => {
    const db = makeDbThroughVariance()
    const channel = db.prepare('SELECT id FROM channels').get() as { id: string }
    const now = new Date().toISOString()
    const projectId = randomUUID()
    db.prepare(
      `INSERT INTO projects (
         id, name, transcript, status, channel_id, avg_characters, variance_percent, fake_duration_sec,
         max_retry, scene_concurrency, created_at, updated_at
       ) VALUES (?, 'P', '', 'draft', ?, 300, 30, 3, 1, 4, ?, ?)`
    ).run(projectId, channel.id, now, now)

    db.exec(migration0006AddHasCharacters.sql)

    const projectRow = db.prepare('SELECT has_characters FROM projects WHERE id = ?').get(projectId) as { has_characters: number }
    const channelRow = db.prepare('SELECT has_characters FROM channels WHERE id = ?').get(channel.id) as { has_characters: number }
    expect(projectRow.has_characters).toBe(1)
    expect(channelRow.has_characters).toBe(1)
  })

  it('lets a fresh insert after the migration set its own has_characters', () => {
    const db = makeDbThroughVariance()
    db.exec(migration0006AddHasCharacters.sql)
    const now = new Date().toISOString()

    const channelId = randomUUID()
    db.prepare(
      `INSERT INTO channels (
         id, name, avg_characters, variance_percent, fake_duration_sec, selected_model,
         character_detection_prompt, character_generation_prompt, scene_generation_prompt,
         scene_concurrency, scene_batch_size, has_characters, created_at, updated_at
       ) VALUES (?, 'No Characters Channel', 300, 30, 3, NULL, 'd', 'g', 's', 4, 10, 0, ?, ?)`
    ).run(channelId, now, now)

    const projectId = randomUUID()
    db.prepare(
      `INSERT INTO projects (
         id, name, transcript, status, channel_id, avg_characters, variance_percent, fake_duration_sec,
         max_retry, scene_concurrency, has_characters, created_at, updated_at
       ) VALUES (?, 'P2', '', 'draft', ?, 300, 30, 3, 1, 4, 0, ?, ?)`
    ).run(projectId, channelId, now, now)

    const channelRow = db.prepare('SELECT has_characters FROM channels WHERE id = ?').get(channelId) as { has_characters: number }
    const projectRow = db.prepare('SELECT has_characters FROM projects WHERE id = ?').get(projectId) as { has_characters: number }
    expect(channelRow.has_characters).toBe(0)
    expect(projectRow.has_characters).toBe(0)
  })
})

// Schema state right before 0007 runs: 0001 + 0004 (channels) + 0005 (rename/
// variance) + 0006 (has_characters) — 0007 doesn't touch anything 0002/0003 add.
function makeDbThroughHasCharacters(): Database.Database {
  const db = makeDbThroughVariance()
  db.exec(migration0006AddHasCharacters.sql)
  return db
}

describe('migration 0007_add_scene_generation_prompt_no_characters', () => {
  it("backfills existing channels with the real default prompt text (not blank)", () => {
    const db = makeDbThroughHasCharacters()
    const channel = db.prepare('SELECT id FROM channels').get() as { id: string }

    db.exec(migration0007AddSceneGenerationPromptNoCharacters.sql)

    const row = db.prepare('SELECT scene_generation_prompt_no_characters FROM channels WHERE id = ?').get(channel.id) as {
      scene_generation_prompt_no_characters: string
    }
    expect(row.scene_generation_prompt_no_characters).toBe(DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT)
  })

  it('lets a fresh insert after the migration set its own scene_generation_prompt_no_characters', () => {
    const db = makeDbThroughHasCharacters()
    db.exec(migration0007AddSceneGenerationPromptNoCharacters.sql)
    const now = new Date().toISOString()

    const channelId = randomUUID()
    db.prepare(
      `INSERT INTO channels (
         id, name, avg_characters, variance_percent, fake_duration_sec, selected_model,
         character_detection_prompt, character_generation_prompt, scene_generation_prompt,
         scene_generation_prompt_no_characters, scene_concurrency, scene_batch_size, has_characters,
         created_at, updated_at
       ) VALUES (?, 'P2', 300, 30, 3, NULL, 'd', 'g', 's', 'custom no-characters prompt', 4, 10, 0, ?, ?)`
    ).run(channelId, now, now)

    const row = db.prepare('SELECT scene_generation_prompt_no_characters FROM channels WHERE id = ?').get(channelId) as {
      scene_generation_prompt_no_characters: string
    }
    expect(row.scene_generation_prompt_no_characters).toBe('custom no-characters prompt')
  })
})
