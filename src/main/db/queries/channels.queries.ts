import type Database from 'better-sqlite3'
import type { Channel } from '@shared/entities'

// snake_case row shape as stored in SQLite, mapped to the camelCase Channel
// entity (src/shared/entities.ts) at the query boundary — same convention as
// projects.queries.ts.
interface ChannelRow {
  id: string
  name: string
  avg_characters: number
  variance_percent: number
  fake_duration_sec: number
  selected_model: string | null
  character_detection_prompt: string
  character_generation_prompt: string
  scene_generation_prompt: string
  scene_generation_prompt_no_characters: string
  scene_concurrency: number
  scene_batch_size: number
  has_characters: number
  created_at: string
  updated_at: string
}

interface ChannelListRow extends ChannelRow {
  project_count: number
}

export interface ChannelWithProjectCount extends Channel {
  projectCount: number
}

function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    avgCharacters: row.avg_characters,
    variancePercent: row.variance_percent,
    fakeDurationSec: row.fake_duration_sec,
    selectedModel: row.selected_model,
    characterDetectionPrompt: row.character_detection_prompt,
    characterGenerationPrompt: row.character_generation_prompt,
    sceneGenerationPrompt: row.scene_generation_prompt,
    sceneGenerationPromptNoCharacters: row.scene_generation_prompt_no_characters,
    sceneConcurrency: row.scene_concurrency,
    sceneBatchSize: row.scene_batch_size,
    hasCharacters: row.has_characters === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function insertChannel(db: Database.Database, channel: Channel): void {
  db.prepare(
    `
    INSERT INTO channels (
      id, name, avg_characters, variance_percent, fake_duration_sec, selected_model,
      character_detection_prompt, character_generation_prompt, scene_generation_prompt,
      scene_generation_prompt_no_characters, scene_concurrency, scene_batch_size, has_characters,
      created_at, updated_at
    ) VALUES (
      @id, @name, @avgCharacters, @variancePercent, @fakeDurationSec, @selectedModel,
      @characterDetectionPrompt, @characterGenerationPrompt, @sceneGenerationPrompt,
      @sceneGenerationPromptNoCharacters, @sceneConcurrency, @sceneBatchSize, @hasCharacters,
      @createdAt, @updatedAt
    )
    `
  ).run({ ...channel, hasCharacters: channel.hasCharacters ? 1 : 0 })
}

export function findChannelById(db: Database.Database, id: string): Channel | null {
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as ChannelRow | undefined
  return row ? toChannel(row) : null
}

// project_count powers both the "N projects" label and the delete guard
// (ChannelService.delete refuses when this is > 0) — computed here instead
// of cached, same reasoning as listProjectSummaries's srt_count/etc.
export function listChannels(db: Database.Database): ChannelWithProjectCount[] {
  const rows = db
    .prepare(
      `
      SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.channel_id = c.id) AS project_count
      FROM channels c
      ORDER BY c.created_at ASC
      `
    )
    .all() as ChannelListRow[]
  return rows.map((row) => ({ ...toChannel(row), projectCount: row.project_count }))
}

export function countProjectsByChannelId(db: Database.Database, channelId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM projects WHERE channel_id = ?').get(channelId) as { count: number }
  return row.count
}

export function countChannels(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM channels').get() as { count: number }
  return row.count
}

export function updateChannel(
  db: Database.Database,
  id: string,
  patch: {
    name: string
    avgCharacters: number
    variancePercent: number
    fakeDurationSec: number
    selectedModel: string | null
    characterDetectionPrompt: string
    characterGenerationPrompt: string
    sceneGenerationPrompt: string
    sceneGenerationPromptNoCharacters: string
    sceneConcurrency: number
    sceneBatchSize: number
    hasCharacters: boolean
  },
  updatedAt: string
): void {
  db.prepare(
    `UPDATE channels SET
       name = @name,
       avg_characters = @avgCharacters,
       variance_percent = @variancePercent,
       fake_duration_sec = @fakeDurationSec,
       selected_model = @selectedModel,
       character_detection_prompt = @characterDetectionPrompt,
       character_generation_prompt = @characterGenerationPrompt,
       scene_generation_prompt = @sceneGenerationPrompt,
       scene_generation_prompt_no_characters = @sceneGenerationPromptNoCharacters,
       scene_concurrency = @sceneConcurrency,
       scene_batch_size = @sceneBatchSize,
       has_characters = @hasCharacters,
       updated_at = @updatedAt
     WHERE id = @id`
  ).run({ ...patch, hasCharacters: patch.hasCharacters ? 1 : 0, updatedAt, id })
}

export function deleteChannelById(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM channels WHERE id = ?').run(id)
}
