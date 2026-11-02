import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { ProjectStatus } from '@shared/enums'
import { pipelineSettingsSchema, type PipelineSettingsFormValues } from '@renderer/lib/validation/pipelineSettings.schema'

// spec.md 33 — Scene Generation concurrency (default 4, range 1-10) and Scene
// Generation batch size (default 10, range 1-30, added 2026-08-10) live on
// `projects` (schema.md), not AppSettings — there's no per-app default to
// edit here, only the currently open project's own values. This page itself
// is global (routed under `/settings`, outside `/projects/:id`), so it edits
// whichever project useProjectStore last loaded — the same project TopBar's
// gear icon came from. Opening Settings without ever having opened a project
// (e.g. from Home's sidebar) leaves nothing to edit.
//
// Max Retry no longer has a control here (2026-08-10, user request) — every
// project is fixed at ProjectService.DEFAULT_MAX_RETRY (1). The backend
// (updatePipelineSettings, still requires all 3 fields in one call) is
// untouched, so onSubmit passes the project's existing maxRetry through
// unchanged alongside the edited sceneConcurrency/sceneBatchSize.
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
    defaultValues: { sceneConcurrency: 4, sceneBatchSize: 10 }
  })

  useEffect(() => {
    if (currentProject) {
      reset({ sceneConcurrency: currentProject.sceneConcurrency, sceneBatchSize: currentProject.sceneBatchSize })
    }
  }, [currentProject, reset])

  const isProcessing = currentProject?.status === ProjectStatus.PROCESSING
  const disabled = !currentProject || isProcessing

  const onSubmit = handleSubmit(async (values) => {
    if (!currentProject) return
    setSaveMessage(null)
    const updated = await appApi.projects.updatePipelineSettings(currentProject.id, {
      maxRetry: currentProject.maxRetry,
      sceneConcurrency: values.sceneConcurrency,
      sceneBatchSize: values.sceneBatchSize
    })
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
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
              SCENE GENERATION CONCURRENCY
            </label>
            <input
              {...register('sceneConcurrency')}
              disabled={disabled}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 1–10. Default 4.</p>
            {errors.sceneConcurrency && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.sceneConcurrency.message}</p>
            )}
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
              SCENE GENERATION BATCH SIZE
            </label>
            <input
              {...register('sceneBatchSize')}
              disabled={disabled}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
              Range 1–30. Default 10. Number of SRT blocks grouped into each Image Prompt request.
            </p>
            {errors.sceneBatchSize && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.sceneBatchSize.message}</p>
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
