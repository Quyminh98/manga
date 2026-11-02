import { DEFAULT_CHARACTER_DETECTION_PROMPT, DEFAULT_CHARACTER_GENERATION_PROMPT, DEFAULT_SCENE_GENERATION_PROMPT } from '@shared/prompts'

// Real schema change (new table + new column) — confirmed with the user
// before implementing, per CLAUDE.md (see the Phase 18 plan). Channels group
// projects under a shared, editable settings template (Max Characters /
// Duration / Model / 3 prompt templates / Scene Concurrency / Scene Batch
// Size) — a project copies its channel's values once, at creation time, into
// its own already-existing per-project columns (same copy-once pattern
// AppSettings → project has used since Phase 4). Editing a channel later
// never retroactively changes a project that already copied from it.
//
// Every project must belong to exactly one channel (no "channel-less"
// project state to special-case anywhere downstream) — so this migration
// creates a single "Default" channel and backfills every existing project
// onto it via a fixed, deterministic id (not randomUUID(), which would
// differ between the INSERT below and the UPDATE that has to target the
// exact same row). Exported so ProjectService.create() can fall back to it
// when a caller omits channelId (unit tests exercising ProjectService
// directly, not through the projects:create IPC handler, which always
// resolves and passes a real channel) — this row is guaranteed to exist in
// every database, including a fresh createDatabase(':memory:'), since
// migrations always run first.
export const DEFAULT_CHANNEL_ID = '00000000-0000-4000-8000-000000000001'

// Hard-coded to the same constants ProjectService already uses when no
// channel exists to draw from (DEFAULT_MAX_CHARACTERS=300, etc.) rather than
// reading the live AppSettings at migration time: every existing project
// already has its own copy of these values (max_characters/fake_duration_sec/
// scene_concurrency/scene_batch_size/*_prompt_snapshot), taken from
// AppSettings at the moment *it* was created — this channel's own values
// only ever apply to a *new* project created inside "Default" going forward,
// never retroactively to a project that predates channels. Keeping the
// migration pure SQL (no electron-store read mid-migration) avoids a
// non-deterministic, hard-to-test migration step.
const DEFAULT_MAX_CHARACTERS = 300
const DEFAULT_FAKE_DURATION_SEC = 3
const DEFAULT_SCENE_CONCURRENCY = 4
const DEFAULT_SCENE_BATCH_SIZE = 10

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

// projects.channel_id is added nullable, then backfilled via a separate
// UPDATE, instead of `ADD COLUMN ... NOT NULL REFERENCES channels (id)
// DEFAULT '<uuid>'` in one statement — SQLite rejects that combination
// outright ("Cannot add a REFERENCES column with non-NULL default value")
// whenever the table already has rows, which is exactly the real-world
// upgrade case this migration exists for (a database with existing
// projects). Not enforced NOT NULL at the schema level as a result — every
// row is still non-null in practice: this migration's own UPDATE backfills
// every existing row, and ProjectService.create() (the only code path that
// inserts a project) always supplies a real channelId going forward.

export const migration0004AddChannels = {
  name: '0004_add_channels',
  sql: `
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_characters INTEGER NOT NULL,
  fake_duration_sec INTEGER NOT NULL,
  selected_model TEXT,
  character_detection_prompt TEXT NOT NULL,
  character_generation_prompt TEXT NOT NULL,
  scene_generation_prompt TEXT NOT NULL,
  scene_concurrency INTEGER NOT NULL,
  scene_batch_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO channels (
  id, name, max_characters, fake_duration_sec, selected_model,
  character_detection_prompt, character_generation_prompt, scene_generation_prompt,
  scene_concurrency, scene_batch_size, created_at, updated_at
) VALUES (
  '${DEFAULT_CHANNEL_ID}', 'Default', ${DEFAULT_MAX_CHARACTERS}, ${DEFAULT_FAKE_DURATION_SEC}, NULL,
  '${escapeSqlString(DEFAULT_CHARACTER_DETECTION_PROMPT)}',
  '${escapeSqlString(DEFAULT_CHARACTER_GENERATION_PROMPT)}',
  '${escapeSqlString(DEFAULT_SCENE_GENERATION_PROMPT)}',
  ${DEFAULT_SCENE_CONCURRENCY}, ${DEFAULT_SCENE_BATCH_SIZE}, datetime('now'), datetime('now')
);

ALTER TABLE projects ADD COLUMN channel_id TEXT REFERENCES channels (id);

UPDATE projects SET channel_id = '${DEFAULT_CHANNEL_ID}' WHERE channel_id IS NULL;
`
}
