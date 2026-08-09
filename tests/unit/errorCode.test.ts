import { describe, expect, it } from 'vitest'
import { ERROR_CODE_LABELS, formatStoredError, isTransientErrorCode, parseStoredError } from '../../src/shared/errorCode'
import { ErrorCode } from '../../src/shared/enums'

describe('formatStoredError / parseStoredError', () => {
  it('round-trips a code + message', () => {
    const stored = formatStoredError(ErrorCode.TIMEOUT, 'Request timed out')
    expect(stored).toBe('TIMEOUT: Request timed out')
    expect(parseStoredError(stored)).toEqual({ code: ErrorCode.TIMEOUT, message: 'Request timed out' })
  })

  it('preserves a message that itself contains ": "', () => {
    const stored = formatStoredError(ErrorCode.API_ERROR, 'Character Detection failed after 3 attempt(s): boom')
    expect(parseStoredError(stored)).toEqual({
      code: ErrorCode.API_ERROR,
      message: 'Character Detection failed after 3 attempt(s): boom'
    })
  })

  it('returns code: null for a plain validation message with no code prefix', () => {
    expect(parseStoredError('Add a transcript before running Character Detection.')).toEqual({
      code: null,
      message: 'Add a transcript before running Character Detection.'
    })
  })

  it('returns code: null / empty message for null or empty input', () => {
    expect(parseStoredError(null)).toEqual({ code: null, message: '' })
    expect(parseStoredError(undefined)).toEqual({ code: null, message: '' })
    expect(parseStoredError('')).toEqual({ code: null, message: '' })
  })

  it('finds the code even when wrapped by Electron\'s IPC rejection format', () => {
    // ipcRenderer wraps a Main-process throw as
    // `Error invoking remote method '...': Error: <CODE>: <detail>` before it
    // reaches the Renderer's catch block (see ExportPage/ProjectsListPage's
    // EXPORT_CANCELED handling for the same wrapping).
    const wrapped = "Error invoking remote method 'export:project': Error: EXPORT_ERROR: disk full"
    expect(parseStoredError(wrapped)).toEqual({ code: ErrorCode.EXPORT_ERROR, message: 'disk full' })
  })

  it('every ErrorCode value has a label', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_CODE_LABELS[code]).toBeTruthy()
    }
  })
})

describe('isTransientErrorCode', () => {
  it('flags RATE_LIMIT/NETWORK_ERROR/TIMEOUT as transient', () => {
    expect(isTransientErrorCode(ErrorCode.RATE_LIMIT)).toBe(true)
    expect(isTransientErrorCode(ErrorCode.NETWORK_ERROR)).toBe(true)
    expect(isTransientErrorCode(ErrorCode.TIMEOUT)).toBe(true)
  })

  it('does not flag the rest as transient', () => {
    expect(isTransientErrorCode(ErrorCode.INVALID_API_KEY)).toBe(false)
    expect(isTransientErrorCode(ErrorCode.CONTEXT_TOO_LARGE)).toBe(false)
    expect(isTransientErrorCode(ErrorCode.DATABASE_ERROR)).toBe(false)
  })
})
