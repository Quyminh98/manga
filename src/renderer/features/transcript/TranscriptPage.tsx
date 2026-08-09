import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, MousePointerClick, Trash2, Clipboard } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'

// spec.md 8.2 — Paste / Select all / Clear / Load .txt + character/word count.
// Autosaves projects.transcript on change (spec.md 6.3), debounced so we
// don't hit SQLite on every keystroke.
const AUTOSAVE_DEBOUNCE_MS = 800

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function TranscriptPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const [transcript, setTranscript] = useState(currentProject?.transcript ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  const onPaste = async (): Promise<void> => {
    setNotice(null)
    try {
      const text = await navigator.clipboard.readText()
      updateTranscript(text)
    } catch {
      setNotice('Could not read the clipboard — paste directly into the editor (Cmd+V) instead.')
    }
  }

  const onSelectAll = (): void => {
    textareaRef.current?.select()
  }

  const onClear = (): void => {
    updateTranscript('')
  }

  const onLoadFile = async (): Promise<void> => {
    setNotice(null)
    try {
      const content = await appApi.projects.loadTranscriptFile()
      if (content !== null) updateTranscript(content)
    } catch {
      setNotice('Could not load the selected file.')
    }
  }

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
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-code-sm text-code-sm text-text-secondary w-16 text-right">
            {SAVE_LABEL[saveStatus]}
          </span>
          <Button variant="ghost" type="button" onClick={() => void onPaste()}>
            <Clipboard size={14} />
            Paste
          </Button>
          <Button variant="ghost" type="button" onClick={onSelectAll}>
            <MousePointerClick size={14} />
            Select All
          </Button>
          <Button variant="ghost" type="button" onClick={onClear}>
            <Trash2 size={14} />
            Clear
          </Button>
          <Button variant="ghost" type="button" onClick={() => void onLoadFile()}>
            <FileText size={14} />
            Load .txt
          </Button>
        </div>
      </div>

      {notice && <p className="mb-3 font-body-sm text-body-sm text-error">{notice}</p>}

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
          ref={textareaRef}
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
