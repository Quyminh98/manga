export const ProjectStatus = {
  DRAFT: 'draft',
  READY: 'ready',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
  FAILED: 'failed'
} as const
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]

// Shared by pipeline_tasks.status, character_prompts.status, scene_prompts.status.
// UI derives "retrying" (running + attempts > 1) and "skipped" (success, bypassed on Resume) —
// not persisted, see schema.md Conventions.
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed'
} as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export const TaskType = {
  SPLIT_SRT: 'SPLIT_SRT',
  DETECT_CHARACTERS: 'DETECT_CHARACTERS',
  GENERATE_CHARACTER_PROMPTS: 'GENERATE_CHARACTER_PROMPTS',
  SELECT_RELEVANT_CHARACTERS: 'SELECT_RELEVANT_CHARACTERS',
  GENERATE_SCENE_PROMPT: 'GENERATE_SCENE_PROMPT',
  EXPORT: 'EXPORT'
} as const
export type TaskType = (typeof TaskType)[keyof typeof TaskType]

export const ErrorCode = {
  INVALID_API_KEY: 'INVALID_API_KEY',
  MODEL_NOT_AVAILABLE: 'MODEL_NOT_AVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  CONTEXT_TOO_LARGE: 'CONTEXT_TOO_LARGE',
  INVALID_JSON: 'INVALID_JSON',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  API_ERROR: 'API_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXPORT_ERROR: 'EXPORT_ERROR'
} as const
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export const VilaoConnectionStatus = {
  NOT_CONFIGURED: 'not_configured',
  CHECKING: 'checking',
  CONNECTED: 'connected',
  INVALID: 'invalid',
  ERROR: 'error'
} as const
export type VilaoConnectionStatus = (typeof VilaoConnectionStatus)[keyof typeof VilaoConnectionStatus]
