import { ErrorCode } from '@shared/enums'
import { LlmApiError } from '../llm/LlmClient'
import { LlmResponseFormatError } from './errors'

// spec.md 34 — maps whatever a pipeline retry loop actually caught (a Vilao
// API failure, a malformed LLM response, or a raw SQLite error surfacing
// from a persist step inside the same try block) to one of the 11 documented
// error codes + the original detail message. Pure/no Electron import — the
// caller (CharacterService/ScenePromptService) formats the result into the
// `.error` column via src/shared/errorCode.ts's formatStoredError.

function haystackOf(message: string, apiErrorType: string | null, apiErrorCode: string | null): string {
  return `${apiErrorType ?? ''} ${apiErrorCode ?? ''} ${message}`.toLowerCase()
}

// Vilao is OpenAI-compatible (spec.md 5.2) — `context_length_exceeded` is
// that ecosystem's standard `error.type`/`error.code` for this case; the
// substring checks are a fallback for providers/models that only put it in
// the free-text message.
function isContextTooLarge(message: string, apiErrorType: string | null, apiErrorCode: string | null): boolean {
  const haystack = haystackOf(message, apiErrorType, apiErrorCode)
  return (
    haystack.includes('context_length_exceeded') ||
    haystack.includes('context too large') ||
    haystack.includes('maximum context length') ||
    (haystack.includes('context') && haystack.includes('exceed')) ||
    (haystack.includes('token') && haystack.includes('exceed'))
  )
}

function isModelNotAvailable(message: string, apiErrorType: string | null, apiErrorCode: string | null): boolean {
  const haystack = haystackOf(message, apiErrorType, apiErrorCode)
  return (
    haystack.includes('model_not_found') ||
    (haystack.includes('model') &&
      (haystack.includes('not found') ||
        haystack.includes('does not exist') ||
        haystack.includes('not available') ||
        haystack.includes('invalid model')))
  )
}

interface SqliteLikeError {
  code?: unknown
}

function isSqliteError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && typeof (err as SqliteLikeError).code === 'string' && (err as SqliteLikeError).code!.toString().startsWith('SQLITE_')
}

export interface ClassifiedError {
  code: ErrorCode
  message: string
}

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof LlmApiError) {
    const { message, status, apiErrorType, apiErrorCode } = err

    if (message.endsWith('returned an empty response')) return { code: ErrorCode.EMPTY_RESPONSE, message }

    if (status === null) {
      // Phase 28 — timeouts now carry a detail suffix ("… (no data for 180s)").
      return message.startsWith('Request timed out')
        ? { code: ErrorCode.TIMEOUT, message }
        : { code: ErrorCode.NETWORK_ERROR, message }
    }
    if (status === 401) return { code: ErrorCode.INVALID_API_KEY, message }
    if (status === 429) return { code: ErrorCode.RATE_LIMIT, message }
    if (isContextTooLarge(message, apiErrorType, apiErrorCode) || status === 413) {
      return { code: ErrorCode.CONTEXT_TOO_LARGE, message }
    }
    if (isModelNotAvailable(message, apiErrorType, apiErrorCode)) {
      return { code: ErrorCode.MODEL_NOT_AVAILABLE, message }
    }
    return { code: ErrorCode.API_ERROR, message }
  }

  if (err instanceof LlmResponseFormatError) {
    return { code: ErrorCode.INVALID_JSON, message: err.message }
  }

  if (isSqliteError(err)) {
    return { code: ErrorCode.DATABASE_ERROR, message: err instanceof Error ? err.message : 'Database error' }
  }

  return { code: ErrorCode.API_ERROR, message: err instanceof Error ? err.message : 'Unknown error' }
}
