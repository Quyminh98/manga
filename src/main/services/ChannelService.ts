import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { Channel } from '@shared/entities'
import {
  countChannels,
  countProjectsByChannelId,
  deleteChannelById,
  findChannelById,
  insertChannel,
  listChannels,
  updateChannel,
  type ChannelWithProjectCount
} from '../db/queries/channels.queries'

// Same ranges ProjectService.updatePipelineSettings already validates for
// the equivalent per-project fields — kept in sync deliberately, since a
// channel's values are exactly what gets copied into those same per-project
// columns at project-creation time (see ProjectService.create).
const AVG_CHARACTERS_MIN = 30
const AVG_CHARACTERS_MAX = 2000
// 0 = old hard-ceiling behavior (splitSrt.ts's min === max); 90 keeps the
// lower bound from collapsing to near-zero for a small average.
const VARIANCE_PERCENT_MIN = 0
const VARIANCE_PERCENT_MAX = 90
const FAKE_DURATION_MIN = 1
const FAKE_DURATION_MAX = 30
const SCENE_CONCURRENCY_MIN = 1
const SCENE_CONCURRENCY_MAX = 10
const SCENE_BATCH_SIZE_MIN = 1
const SCENE_BATCH_SIZE_MAX = 30

export interface ChannelInput {
  name: string
  avgCharacters: number
  variancePercent: number
  fakeDurationSec: number
  selectedModel: string | null
  characterDetectionPrompt: string
  characterGenerationPrompt: string
  sceneGenerationPrompt: string
  // Phase 22 — used instead of sceneGenerationPrompt at runtime when
  // hasCharacters is false. Required unconditionally here too, same
  // reasoning as characterDetectionPrompt/characterGenerationPrompt above.
  sceneGenerationPromptNoCharacters: string
  sceneConcurrency: number
  sceneBatchSize: number
  // Phase 21 — false skips Character Detection/Character Prompt Generation
  // for projects created in this channel. Doesn't affect validate() below:
  // characterDetectionPrompt/characterGenerationPrompt stay required either
  // way (ChannelForm.tsx only hides them from the UI, still submits whatever
  // value was already there).
  hasCharacters: boolean
}

// No electron import — takes a Database instance so it's usable both from
// the real app (see DatabaseService) and from unit tests (createDatabase(':memory:')),
// same convention as ProjectService/CharacterService.
export class ChannelService {
  constructor(private readonly db: Database.Database) {}

  private validate(input: ChannelInput): void {
    if (!input.name.trim()) throw new Error('Channel name is required')
    if (!Number.isInteger(input.avgCharacters) || input.avgCharacters < AVG_CHARACTERS_MIN || input.avgCharacters > AVG_CHARACTERS_MAX) {
      throw new Error(`Average characters per SRT must be between ${AVG_CHARACTERS_MIN} and ${AVG_CHARACTERS_MAX}.`)
    }
    if (
      !Number.isInteger(input.variancePercent) ||
      input.variancePercent < VARIANCE_PERCENT_MIN ||
      input.variancePercent > VARIANCE_PERCENT_MAX
    ) {
      throw new Error(`Variance must be between ${VARIANCE_PERCENT_MIN} and ${VARIANCE_PERCENT_MAX}.`)
    }
    if (!Number.isInteger(input.fakeDurationSec) || input.fakeDurationSec < FAKE_DURATION_MIN || input.fakeDurationSec > FAKE_DURATION_MAX) {
      throw new Error(`Duration per SRT block must be between ${FAKE_DURATION_MIN} and ${FAKE_DURATION_MAX}.`)
    }
    if (
      !Number.isInteger(input.sceneConcurrency) ||
      input.sceneConcurrency < SCENE_CONCURRENCY_MIN ||
      input.sceneConcurrency > SCENE_CONCURRENCY_MAX
    ) {
      throw new Error(`Scene Generation concurrency must be between ${SCENE_CONCURRENCY_MIN} and ${SCENE_CONCURRENCY_MAX}.`)
    }
    if (
      !Number.isInteger(input.sceneBatchSize) ||
      input.sceneBatchSize < SCENE_BATCH_SIZE_MIN ||
      input.sceneBatchSize > SCENE_BATCH_SIZE_MAX
    ) {
      throw new Error(`Scene Generation batch size must be between ${SCENE_BATCH_SIZE_MIN} and ${SCENE_BATCH_SIZE_MAX}.`)
    }
    if (!input.characterDetectionPrompt.trim()) throw new Error('Character Detection prompt is required.')
    if (!input.characterGenerationPrompt.trim()) throw new Error('Character Generation prompt is required.')
    if (!input.sceneGenerationPrompt.trim()) throw new Error('Scene / Image Generation prompt is required.')
    if (!input.sceneGenerationPromptNoCharacters.trim()) {
      throw new Error('Scene / Image Generation prompt (No Characters) is required.')
    }
  }

  create(input: ChannelInput): Channel {
    this.validate(input)
    const now = new Date().toISOString()
    const channel: Channel = {
      id: randomUUID(),
      name: input.name.trim(),
      avgCharacters: input.avgCharacters,
      variancePercent: input.variancePercent,
      fakeDurationSec: input.fakeDurationSec,
      selectedModel: input.selectedModel,
      characterDetectionPrompt: input.characterDetectionPrompt,
      characterGenerationPrompt: input.characterGenerationPrompt,
      sceneGenerationPrompt: input.sceneGenerationPrompt,
      sceneGenerationPromptNoCharacters: input.sceneGenerationPromptNoCharacters,
      sceneConcurrency: input.sceneConcurrency,
      sceneBatchSize: input.sceneBatchSize,
      hasCharacters: input.hasCharacters,
      createdAt: now,
      updatedAt: now
    }
    insertChannel(this.db, channel)
    return channel
  }

  get(id: string): Channel | null {
    return findChannelById(this.db, id)
  }

  list(): ChannelWithProjectCount[] {
    return listChannels(this.db)
  }

  update(id: string, input: ChannelInput): Channel {
    if (!findChannelById(this.db, id)) throw new Error(`Channel not found: ${id}`)
    this.validate(input)
    const updatedAt = new Date().toISOString()
    updateChannel(this.db, id, { ...input, name: input.name.trim() }, updatedAt)
    return findChannelById(this.db, id) as Channel
  }

  // Refuses when the channel still has projects (so a project's already-
  // copied settings never lose the channel they were labeled with) or when
  // it's the last remaining channel (New Project always needs at least one
  // to pick from) — checked explicitly here rather than relying on the raw
  // SQLite foreign-key error the first case would also produce, for a
  // friendlier message.
  delete(id: string): void {
    if (!findChannelById(this.db, id)) throw new Error(`Channel not found: ${id}`)
    const projectCount = countProjectsByChannelId(this.db, id)
    if (projectCount > 0) {
      throw new Error('Cannot delete a channel that still has projects. Delete or move those projects first.')
    }
    if (countChannels(this.db) <= 1) {
      throw new Error('Cannot delete the last remaining channel.')
    }
    deleteChannelById(this.db, id)
  }
}
