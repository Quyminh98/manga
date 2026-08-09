import { ErrorCode } from './enums'

// spec.md 34 — the 11 error codes are documented as "valid values for `.error`"
// in schema.md, but the app also wants the specific detail text (e.g. which
// model, what the API actually said) for debugging and for the UI's "Scene
// 028 failed: API timeout" style messages. Storing `"<CODE>: <detail>"` in
// the existing `error` TEXT column (character_prompts/scene_prompts/
// pipeline_tasks) satisfies both without a schema change — the code is
// always one of the 11 values, the detail is everything after it.
const CODE_VALUES = new Set<string>(Object.values(ErrorCode))

export function formatStoredError(code: ErrorCode, message: string): string {
  return `${code}: ${message}`
}

export interface ParsedError {
  code: ErrorCode | null
  message: string
}

// Matches "<CODE>: " either at the very start of the string (the raw DB
// `.error` value, e.g. character_prompts/scene_prompts/pipeline_tasks — read
// directly, never wrapped) or right after "...: " (an IPC rejection: Electron
// wraps a Main-process throw as `Error invoking remote method '...': Error:
// <CODE>: <detail>` before it reaches the Renderer's catch block, same
// wrapping ExportPage/ProjectsListPage already account for around
// EXPORT_CANCELED) — so one parser handles both a stored row's `.error` and
// a thrown-and-caught IPC error's `.message`.
const CODE_PATTERN = new RegExp(`(?:^|:\\s)(${[...CODE_VALUES].join('|')}): `)

// Splits a stored/thrown error string back into its code + detail. Returns
// `code: null` for anything with no recognizable code (validation errors
// like "Add a transcript first", or error strings persisted before Phase 12
// shipped) — callers fall back to showing the raw string with no badge.
export function parseStoredError(raw: string | null | undefined): ParsedError {
  if (!raw) return { code: null, message: '' }
  const match = raw.match(CODE_PATTERN)
  if (!match) return { code: null, message: raw }
  return { code: match[1] as ErrorCode, message: raw.slice((match.index ?? 0) + match[0].length) }
}

export const ERROR_CODE_LABELS: Record<ErrorCode, string> = {
  [ErrorCode.INVALID_API_KEY]: 'Invalid API key',
  [ErrorCode.MODEL_NOT_AVAILABLE]: 'Model not available',
  [ErrorCode.NETWORK_ERROR]: 'Network error',
  [ErrorCode.TIMEOUT]: 'Timed out',
  [ErrorCode.RATE_LIMIT]: 'Rate limited',
  [ErrorCode.CONTEXT_TOO_LARGE]: 'Context too large',
  [ErrorCode.INVALID_JSON]: 'Invalid response',
  [ErrorCode.EMPTY_RESPONSE]: 'Empty response',
  [ErrorCode.API_ERROR]: 'API error',
  [ErrorCode.DATABASE_ERROR]: 'Database error',
  [ErrorCode.EXPORT_ERROR]: 'Export error'
}

// spec.md 33/34 — rate limits/network blips/timeouts are transient (a later
// Retry can plausibly succeed unchanged); everything else needs user action
// (fix the API key, pick another model, shorten input) or is a hard failure.
// Used by the UI to pick a "warning" vs. "error" badge color (DESIGN.md
// `tertiary` — same token already used for the "completed_with_errors"
// project status badge — vs. `error`).
const TRANSIENT_CODES = new Set<ErrorCode>([ErrorCode.RATE_LIMIT, ErrorCode.NETWORK_ERROR, ErrorCode.TIMEOUT])

export function isTransientErrorCode(code: ErrorCode): boolean {
  return TRANSIENT_CODES.has(code)
}
