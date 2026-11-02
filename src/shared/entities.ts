import type { ProjectStatus, TaskStatus, TaskType } from './enums'

// Field-for-field mirror of context/schema.md — do not add/remove/rename fields
// without updating schema.md first.

// Phase 18 — Channels group projects under a shared, editable settings
// template. A project copies its channel's values once, at creation time
// (see ProjectService.create) — editing a channel afterward never
// retroactively changes a project that already copied from it.
export interface Channel {
  id: string
  name: string
  // "Average", not a hard ceiling — see splitSrt.ts's gatherBlocks(). The
  // actual per-SRT-block length ranges [avgCharacters * (1 -
  // variancePercent/100), avgCharacters * (1 + variancePercent/100)].
  avgCharacters: number
  variancePercent: number
  fakeDurationSec: number
  selectedModel: string | null
  characterDetectionPrompt: string
  characterGenerationPrompt: string
  sceneGenerationPrompt: string
  // Phase 22 — used instead of sceneGenerationPrompt for a project whose
  // channel has hasCharacters=false. Always populated (like the 2 character
  // prompts above), even though only one of the two scene prompts is ever
  // actually used by a given project (whichever matches its own hasCharacters).
  sceneGenerationPromptNoCharacters: string
  sceneConcurrency: number
  sceneBatchSize: number
  // Phase 21 — false skips Character Detection/Character Prompt Generation
  // entirely for projects created in this channel (transcript with no story
  // characters). Scene Generation already tolerates 0 characters.
  hasCharacters: boolean
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  transcript: string
  status: ProjectStatus
  channelId: string
  selectedModel: string | null
  avgCharacters: number
  variancePercent: number
  fakeDurationSec: number
  maxRetry: number
  sceneConcurrency: number
  sceneBatchSize: number
  // Phase 21 — copied once from the channel at project-creation time, same
  // pattern as avgCharacters/sceneConcurrency/etc. See Channel.hasCharacters.
  hasCharacters: boolean
  characterDetectionPromptSnapshot: string | null
  characterGenerationPromptSnapshot: string | null
  sceneGenerationPromptSnapshot: string | null
  selectedModelSnapshot: string | null
  avgCharactersSnapshot: number | null
  fakeDurationSnapshot: number | null
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
}

export interface SrtBlock {
  id: string
  projectId: string
  blockIndex: number
  startMs: number
  endMs: number
  text: string
  characterCount: number
  createdAt: string
}

export interface Character {
  id: string
  projectId: string
  characterId: string
  name: string
  gender: string
  ageRange: string
  appearance: string
  hair: string
  clothing: string
  personality: string
  role: string
  uniqueFeatures: string
  visualDna: string
  createdAt: string
  updatedAt: string
}

export interface CharacterPrompt {
  id: string
  projectId: string
  characterId: string
  prompt: string | null
  status: TaskStatus
  attempts: number
  error: string | null
  updatedAt: string
}

export interface ScenePrompt {
  id: string
  projectId: string
  srtBlockId: string
  blockIndex: number
  relevantCharacterIds: string[]
  prompt: string | null
  status: TaskStatus
  attempts: number
  error: string | null
  updatedAt: string
}

export interface PipelineTask {
  id: string
  projectId: string
  taskType: TaskType
  entityId: string | null
  status: TaskStatus
  attempts: number
  error: string | null
  createdAt: string
  updatedAt: string
}

// Phase 27 — one LLM request made by a project's pipeline (every retry is its
// own row). `step` is the pipeline TaskType that issued it.
export interface LlmCall {
  id: string
  projectId: string
  step: TaskType
  model: string
  status: 'success' | 'failed'
  error: string | null
  durationMs: number
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  createdAt: string
  updatedAt: string
}

export interface ModelInfo {
  id: string
  name: string
}
