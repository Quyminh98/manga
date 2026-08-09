import { ERROR_CODE_LABELS, parseStoredError } from '@shared/errorCode'

// For plain-text error banners (not the per-row ErrorNotice component) —
// turns a stored `"<CODE>: <detail>"` string (or a raw IPC rejection message
// with no code, e.g. validation errors) into one readable line. Raw strings
// pass through unchanged.
export function formatErrorForDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const { code, message } = parseStoredError(raw)
  return code ? `${ERROR_CODE_LABELS[code]}: ${message}` : raw
}
