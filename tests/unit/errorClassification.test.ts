import { describe, expect, it } from 'vitest'
import { classifyError } from '../../src/main/pipeline/errorClassification'
import { VilaoApiError } from '../../src/main/services/VilaoService'
import { LlmResponseFormatError } from '../../src/main/pipeline/errors'
import { SceneFormatCollapseError } from '../../src/main/pipeline/generateScenePrompt'
import { ErrorCode } from '../../src/shared/enums'

describe('classifyError', () => {
  it('maps 401 to INVALID_API_KEY (spec.md 5.1)', () => {
    expect(classifyError(new VilaoApiError('Invalid API key', 401))).toEqual({
      code: ErrorCode.INVALID_API_KEY,
      message: 'Invalid API key'
    })
  })

  it('maps 429 to RATE_LIMIT', () => {
    expect(classifyError(new VilaoApiError('Too many requests', 429)).code).toBe(ErrorCode.RATE_LIMIT)
  })

  it('maps a null status "Request timed out" to TIMEOUT', () => {
    expect(classifyError(new VilaoApiError('Request timed out', null)).code).toBe(ErrorCode.TIMEOUT)
  })

  it('maps any other null-status failure to NETWORK_ERROR', () => {
    expect(classifyError(new VilaoApiError('fetch failed', null)).code).toBe(ErrorCode.NETWORK_ERROR)
  })

  it('maps the empty-response message to EMPTY_RESPONSE regardless of status', () => {
    expect(classifyError(new VilaoApiError('Vilao returned an empty response', null)).code).toBe(ErrorCode.EMPTY_RESPONSE)
  })

  it('maps a context-length message to CONTEXT_TOO_LARGE via the message text', () => {
    expect(classifyError(new VilaoApiError('This model supports a maximum context length of 8192 tokens', 400)).code).toBe(
      ErrorCode.CONTEXT_TOO_LARGE
    )
  })

  it('maps a context-length error via the OpenAI-compatible error.type/code fields', () => {
    expect(classifyError(new VilaoApiError('too long', 400, 'invalid_request_error', 'context_length_exceeded')).code).toBe(
      ErrorCode.CONTEXT_TOO_LARGE
    )
  })

  it('maps 413 (payload too large) to CONTEXT_TOO_LARGE even with a generic message', () => {
    expect(classifyError(new VilaoApiError('Payload too large', 413)).code).toBe(ErrorCode.CONTEXT_TOO_LARGE)
  })

  it('maps a "model not found" message to MODEL_NOT_AVAILABLE', () => {
    expect(classifyError(new VilaoApiError('The model `gpt-9` does not exist', 404)).code).toBe(ErrorCode.MODEL_NOT_AVAILABLE)
  })

  it('maps a generic 404 with no "model" wording to API_ERROR, not MODEL_NOT_AVAILABLE', () => {
    expect(classifyError(new VilaoApiError('Not found', 404)).code).toBe(ErrorCode.API_ERROR)
  })

  it('maps any other status to API_ERROR', () => {
    expect(classifyError(new VilaoApiError('Internal server error', 500)).code).toBe(ErrorCode.API_ERROR)
  })

  it('maps LlmResponseFormatError (and its SceneFormatCollapseError subclass) to INVALID_JSON', () => {
    expect(classifyError(new LlmResponseFormatError('not valid JSON')).code).toBe(ErrorCode.INVALID_JSON)
    expect(classifyError(new SceneFormatCollapseError('not valid JSON')).code).toBe(ErrorCode.INVALID_JSON)
  })

  it('maps a SQLite error (has a SQLITE_* .code) to DATABASE_ERROR', () => {
    const sqliteError = Object.assign(new Error('UNIQUE constraint failed'), { code: 'SQLITE_CONSTRAINT' })
    expect(classifyError(sqliteError).code).toBe(ErrorCode.DATABASE_ERROR)
  })

  it('falls back to API_ERROR with the original message for an unrecognized plain Error', () => {
    expect(classifyError(new Error('rate limited'))).toEqual({ code: ErrorCode.API_ERROR, message: 'rate limited' })
  })

  it('falls back to API_ERROR / "Unknown error" for a non-Error throw', () => {
    expect(classifyError('boom')).toEqual({ code: ErrorCode.API_ERROR, message: 'Unknown error' })
  })
})
