import type { ProjectStatus, TaskStatus, TaskType } from './enums'

// Field-for-field mirror of context/schema.md — do not add/remove/rename fields
// without updating schema.md first.

export interface Project {
  id: string
  name: string
  transcript: string
  status: ProjectStatus
  selectedModel: string | null
  maxCharacters: number
  fakeDurationSec: number
  maxRetry: number
  sceneConcurrency: number
  characterDetectionPromptSnapshot: string | null
  characterGenerationPromptSnapshot: string | null
  sceneGenerationPromptSnapshot: string | null
  selectedModelSnapshot: string | null
  maxCharactersSnapshot: number | null
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

export interface ModelInfo {
  id: string
  name: string
}
