import { AlertCircle } from 'lucide-react'
import { ERROR_CODE_LABELS, isTransientErrorCode, parseStoredError } from '@shared/errorCode'

interface ErrorNoticeProps {
  error: string
  className?: string
}

// spec.md 34 — every persisted `.error` string is `"<CODE>: <detail>"` (see
// src/shared/errorCode.ts); renders as a colored code badge + the human
// detail so failures are scannable by type at a glance, matching the "Scene
// 028 failed: API timeout" style spec.md 34 asks for (the block/character
// number and Retry X/Y count are already shown by the caller — this only
// covers the error string itself). Legacy/unrecognized strings (no known
// code prefix) render as plain text, same as before Phase 12.
export function ErrorNotice({ error, className }: ErrorNoticeProps): JSX.Element {
  const { code, message } = parseStoredError(error)

  if (!code) {
    return <p className={`font-body-sm text-body-sm text-error ${className ?? ''}`}>{error}</p>
  }

  const transient = isTransientErrorCode(code)
  return (
    <p className={`flex flex-wrap items-center gap-1.5 font-body-sm text-body-sm ${transient ? 'text-tertiary' : 'text-error'} ${className ?? ''}`}>
      <AlertCircle size={12} className="shrink-0" />
      <span
        className={`font-label-caps text-label-caps uppercase px-1.5 py-0.5 rounded border shrink-0 ${
          transient ? 'border-tertiary/40 bg-tertiary/10' : 'border-error/40 bg-error/10'
        }`}
      >
        {ERROR_CODE_LABELS[code]}
      </span>
      <span>{message}</span>
    </p>
  )
}
