import { useCallback, useEffect, useRef, useState } from 'react'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'

// spec.md 8.2 — character/word count. Autosaves projects.transcript on
// change (spec.md 6.3), debounced so we don't hit SQLite on every keystroke.
//
// Cập nhật (Phase 15, ngoài phạm vi V1 gốc): Paste/Select All/Clear/Load .txt
// bị xoá theo yêu cầu trực tiếp của user (đã xác nhận lại, biết rõ hệ quả) —
// Paste/Select All/Clear vẫn làm được bằng thao tác tay (Ctrl+V/Ctrl+A/xoá
// text) trực tiếp trong textarea, không mất chức năng. Load .txt thì mất hẳn
// — không còn cách nào khác trong app để nạp file .txt vào transcript của 1
// project đã tồn tại.
const AUTOSAVE_DEBOUNCE_MS = 800

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function TranscriptPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const [transcript, setTranscript] = useState(currentProject?.transcript ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  // Re-sync only when the route's project id changes (not on every
  // currentProject update — persist() below writes back into the store on
  // save, which would otherwise re-trigger this and clobber in-flight edits).
  useEffect(() => {
    setTranscript(currentProject?.transcript ?? '')
    setSaveStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const persist = useCallback(
    (value: string) => {
      if (!projectId) return
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      setSaveStatus('saving')
      saveTimeoutRef.current = setTimeout(() => {
        void appApi.projects
          .updateTranscript(projectId, value)
          .then(() => {
            setSaveStatus('saved')
            useProjectStore.setState((state) =>
              state.currentProject ? { currentProject: { ...state.currentProject, transcript: value } } : state
            )
          })
          .catch(() => setSaveStatus('error'))
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [projectId]
  )

  const updateTranscript = (value: string): void => {
    setTranscript(value)
    persist(value)
  }

  const characterCount = transcript.length
  const wordCount = transcript.trim() === '' ? 0 : transcript.trim().split(/\s+/).length

  if (!projectId) {
    return <div />
  }

  const SAVE_LABEL: Record<SaveStatus, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed'
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Transcript</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            Paste plain text — no timestamps required.
          </p>
        </div>
        <span className="font-code-sm text-code-sm text-text-secondary flex-shrink-0">{SAVE_LABEL[saveStatus]}</span>
      </div>

      {/* DESIGN.md Components > Input Fields wants a focus indicator; this
          panel is one large input, so the whole border (not a left-accent —
          that pattern is for compact single-line inputs elsewhere) picks up
          `vilao-blue` while the textarea inside it is focused. */}
      <div className="bg-surface-slate border border-border-subtle rounded-lg overflow-hidden focus-within:border-vilao-blue transition-colors">
        <div className="px-6 py-3 border-b border-border-subtle bg-surface-container-low flex items-center justify-between">
          <span className="font-label-caps text-label-caps text-text-secondary uppercase tracking-wider">
            Source Transcript
          </span>
          <div className="flex gap-4 font-code-sm text-code-sm text-text-secondary">
            <span>{characterCount.toLocaleString()} characters</span>
            <span>{wordCount.toLocaleString()} words</span>
          </div>
        </div>
        <textarea
          value={transcript}
          onChange={(e) => updateTranscript(e.target.value)}
          placeholder="Paste plain transcript text — no timestamps required."
          spellCheck={false}
          className="w-full h-[480px] resize-none bg-transparent px-6 py-6 font-body-lg text-body-lg text-text-primary leading-relaxed focus:outline-none"
        />
      </div>
    </div>
  )
}
