import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CircleCheck,
  Loader2,
  Menu,
  Octagon,
  Pause,
  Play,
  Settings as SettingsIcon
} from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { usePipelineStore } from '@renderer/stores/usePipelineStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { ProjectStatus } from '@shared/enums'
import { validateProjectForRun } from '@shared/validateRun'

// TopBar per spec.md section 7: Project Name / Model / Run All. Run All is
// wired to PipelineService.runProject() (plan.md Phase 9) — same button
// relabels to "Resume" once a run has left the project paused/failed/
// completed_with_errors, since every step it runs is gated ("if not already
// done", spec.md 19.3), so Run and Resume are the exact same call.
export function TopBar(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id
  const { subscribe, run, pause, cancel, isRunning, error } = usePipelineStore()
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)

  const [blockedReason, setBlockedReason] = useState<string | undefined>('Loading…')
  const [isPausing, setIsPausing] = useState(false)

  useEffect(() => {
    if (projectId) subscribe(projectId)
  }, [projectId, subscribe])

  useEffect(() => {
    if (!currentProject) return
    void (async () => {
      const [settings, hasApiKey] = await Promise.all([appApi.settings.get(), appApi.vilao.hasApiKey()])
      setBlockedReason(
        validateProjectForRun(currentProject, settings.promptSettings, hasApiKey, settings.selectedModel) ?? undefined
      )
    })()
  }, [currentProject])

  if (!projectId || !currentProject) {
    return (
      <header className="fixed top-0 right-0 w-full lg:w-[calc(100%-260px)] h-16 bg-surface-charcoal/80 backdrop-blur-md border-b border-border-subtle z-40 flex items-center px-margin-mobile lg:px-gutter">
        <button
          type="button"
          onClick={toggleSidebar}
          className="lg:hidden text-text-secondary hover:text-text-primary transition-colors"
          title="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
      </header>
    )
  }

  const status = currentProject.status
  const isProcessing = status === ProjectStatus.PROCESSING
  const isPaused = status === ProjectStatus.PAUSED
  const isCompleted = status === ProjectStatus.COMPLETED
  const canRun = !isRunning && !isProcessing && !blockedReason

  const onRunOrResume = (): void => {
    if (!canRun) return
    void run(projectId)
  }

  const onPause = async (): Promise<void> => {
    setIsPausing(true)
    try {
      await pause(projectId)
    } finally {
      setIsPausing(false)
    }
  }

  const onCancel = async (): Promise<void> => {
    setIsPausing(true)
    try {
      await cancel(projectId)
    } finally {
      setIsPausing(false)
    }
  }

  const runLabel =
    status === ProjectStatus.DRAFT || status === ProjectStatus.READY
      ? 'Run All'
      : status === ProjectStatus.FAILED || status === ProjectStatus.COMPLETED_WITH_ERRORS
        ? 'Retry Failed'
        : 'Resume'

  return (
    <header className="fixed top-0 right-0 w-full lg:w-[calc(100%-260px)] h-16 bg-surface-charcoal/80 backdrop-blur-md border-b border-border-subtle z-40 flex items-center justify-between px-margin-mobile lg:px-gutter">
      <div className="flex items-center gap-4 min-w-0">
        <button
          type="button"
          onClick={toggleSidebar}
          className="lg:hidden text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
          title="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <Link
          to="/"
          className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
          title="Back to Projects"
        >
          <ArrowLeft size={20} />
        </Link>
        <h2 className="font-headline-sm text-headline-sm text-text-primary truncate">
          {currentProject.name}
        </h2>
        <span className="font-code-sm text-code-sm text-text-secondary px-2 py-0.5 rounded bg-surface-slate border border-border-subtle">
          {currentProject.selectedModelSnapshot ?? currentProject.selectedModel ?? 'No model selected'}
        </span>
        {error && (
          <span className="flex items-center gap-1 font-body-sm text-body-sm text-error truncate" title={error}>
            <AlertTriangle size={12} />
            {error}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isProcessing || isRunning ? (
          <>
            <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-vilao-blue">
              <Loader2 size={14} className="animate-spin" />
              Processing…
            </span>
            <Button variant="ghost" type="button" onClick={() => void onPause()} disabled={isPausing}>
              <Pause size={14} />
              Pause
            </Button>
            <Button variant="ghost" type="button" onClick={() => void onCancel()} disabled={isPausing}>
              <Octagon size={14} />
              Cancel
            </Button>
          </>
        ) : isCompleted ? (
          <span className="flex items-center gap-2 bg-surface-slate border border-border-subtle text-emerald-success font-body-sm text-body-sm px-4 py-1.5 rounded">
            <CircleCheck size={14} />
            Completed
          </span>
        ) : (
          <Button variant="primary" type="button" onClick={onRunOrResume} disabled={!canRun} title={blockedReason}>
            <Play size={14} />
            {isPaused ? 'Resume' : runLabel}
          </Button>
        )}
        <Link
          to="/settings"
          className="text-text-secondary hover:text-text-primary transition-colors"
          title="Settings"
        >
          <SettingsIcon size={20} />
        </Link>
      </div>
    </header>
  )
}
