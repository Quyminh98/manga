import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { appApi } from '@renderer/lib/appApi'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { promptEditorSchema, type PromptEditorFormValues } from '@renderer/lib/validation/promptSettings.schema'
import { getMissingPlaceholders, type PromptKey } from '@shared/prompts'

interface PromptEditorCardProps {
  icon: LucideIcon
  title: string
  filename: string
  promptKey: PromptKey
  defaultPrompt: string
}

// spec.md 26 — Settings > Prompts editor: Prompt name / Editor / Save / Reset
// to Default / Copy. Backed by AppSettings.promptSettings (electron-store),
// not SQLite — projects only copy this into their own *_prompt_snapshot on
// first Run (spec.md 32, Phase 9), so editing here never touches a project
// mid-pipeline. Reusable across Phase 6/7/8's three prompt editors.
export function PromptEditorCard({ icon: Icon, title, filename, promptKey, defaultPrompt }: PromptEditorCardProps): JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<PromptEditorFormValues>({
    resolver: zodResolver(promptEditorSchema),
    defaultValues: { content: '' }
  })

  useEffect(() => {
    void (async () => {
      const settings = await appApi.settings.get()
      reset({ content: settings.promptSettings[promptKey] })
      setLoaded(true)
    })()
  }, [promptKey, reset])

  const content = watch('content') ?? ''
  const missingPlaceholders = loaded ? getMissingPlaceholders(promptKey, content) : []

  const onSubmit = handleSubmit(async (values) => {
    setSaveMessage(null)
    const settings = await appApi.settings.get()
    await appApi.settings.save({ promptSettings: { ...settings.promptSettings, [promptKey]: values.content } })
    reset({ content: values.content })
    setSaveMessage('Saved.')
  })

  const onReset = (): void => {
    setValue('content', defaultPrompt, { shouldDirty: true })
    setSaveMessage(null)
  }

  const onCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="p-0 flex flex-col h-[420px] overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex justify-between items-center bg-surface-charcoal/50">
        <h3 className="font-headline-sm text-headline-sm text-text-primary flex items-center gap-2">
          <Icon size={16} className="text-vilao-blue" />
          {title}
        </h3>
        <span className="bg-surface-dim border border-border-subtle text-text-secondary font-code-sm text-code-sm px-2 py-0.5 rounded">
          {filename}
        </span>
      </div>
      <form onSubmit={onSubmit} className="flex flex-1 flex-col min-h-0">
        <textarea
          {...register('content')}
          disabled={!loaded}
          spellCheck={false}
          placeholder="Loading…"
          className="flex-1 bg-[#020617] p-4 font-code-sm text-code-sm text-on-surface-variant resize-none focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60"
        />
        <div className="px-4 py-3 border-t border-border-subtle bg-surface-charcoal/30 space-y-2">
          {missingPlaceholders.length > 0 && (
            <p className="flex items-center gap-1.5 font-body-sm text-body-sm text-error">
              <AlertTriangle size={14} />
              Missing required placeholder{missingPlaceholders.length > 1 ? 's' : ''}: {missingPlaceholders.join(', ')}
              . Run is blocked until this is fixed.
            </p>
          )}
          {errors.content && <p className="font-body-sm text-body-sm text-error">{errors.content.message}</p>}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onReset} disabled={!loaded}>
                <RotateCcw size={14} />
                Reset to Default
              </Button>
              <Button type="button" variant="ghost" onClick={() => void onCopy()} disabled={!loaded}>
                <Copy size={14} />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {saveMessage && <span className="font-body-sm text-body-sm text-emerald-success">{saveMessage}</span>}
              <Button type="submit" variant="primary" disabled={!loaded || isSubmitting || !isDirty}>
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Card>
  )
}
