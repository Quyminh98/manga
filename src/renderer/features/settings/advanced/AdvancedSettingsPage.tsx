import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { ProjectStatus } from '@shared/enums'
import { pipelineSettingsSchema, type PipelineSettingsFormValues } from '@renderer/lib/validation/pipelineSettings.schema'

// spec.md 33 — Max Retry (default 3) and Scene Generation concurrency
// (default 2, range 1-5) live on `projects` (schema.md), not AppSettings —
// there's no per-app default to edit here, only the currently open project's
// own values (plan.md Phase 4 decided against adding a global maxRetry to
// AppSettings, a schema change that wasn't needed at the time). This page
// itself is global (routed under `/settings`, outside `/projects/:id`), so
// it edits whichever project useProjectStore last loaded — the same project
// TopBar's gear icon came from. Opening Settings without ever having opened
// a project (e.g. from Home's sidebar) leaves nothing to edit.
export function AdvancedSettingsPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<PipelineSettingsFormValues>({
    resolver: zodResolver(pipelineSettingsSchema),
    defaultValues: { maxRetry: 3, sceneConcurrency: 2 }
  })

  useEffect(() => {
    if (currentProject) reset({ maxRetry: currentProject.maxRetry, sceneConcurrency: currentProject.sceneConcurrency })
  }, [currentProject, reset])

  const isProcessing = currentProject?.status === ProjectStatus.PROCESSING
  const disabled = !currentProject || isProcessing

  const onSubmit = handleSubmit(async (values) => {
    if (!currentProject) return
    setSaveMessage(null)
    const updated = await appApi.projects.updatePipelineSettings(currentProject.id, values)
    useProjectStore.setState({ currentProject: updated })
    setSaveMessage('Saved.')
  })

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <h3 className="font-headline-sm text-headline-sm text-text-primary mb-1">Pipeline Tuning</h3>
        <p className="font-body-sm text-body-sm text-text-secondary mb-4">
          {currentProject
            ? `Applies to "${currentProject.name}" — open a project to tune a different one.`
            : 'Open a project first (Settings reached from a project keeps that project selected here).'}
        </p>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">MAX RETRY</label>
            <input
              {...register('maxRetry')}
              disabled={disabled}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Default 3. Retries per failing task/batch.</p>
            {errors.maxRetry && <p className="mt-1 font-body-sm text-body-sm text-error">{errors.maxRetry.message}</p>}
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
              SCENE GENERATION CONCURRENCY
            </label>
            <input
              {...register('sceneConcurrency')}
              disabled={disabled}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 1–5. Default 2.</p>
            {errors.sceneConcurrency && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.sceneConcurrency.message}</p>
            )}
          </div>
          {isProcessing && (
            <p className="font-body-sm text-body-sm text-text-secondary">
              Pause or wait for the pipeline to finish before changing these.
            </p>
          )}
          <div className="flex items-center justify-end gap-3 pt-2">
            {saveMessage && <p className="font-body-sm text-body-sm text-emerald-success">{saveMessage}</p>}
            <Button type="submit" variant="primary" disabled={disabled || isSubmitting || !isDirty}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
