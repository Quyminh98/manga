import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CircleCheck, Loader2, Menu, Play, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { DeleteProjectModal } from '@renderer/components/DeleteProjectModal'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { usePipelineStore } from '@renderer/stores/usePipelineStore'
import { useQueueStore } from '@renderer/stores/useQueueStore'
import { useUiStore } from '@renderer/stores/useUiStore'
import { ProjectStatus } from '@shared/enums'
import { getRunBlockedReason } from '@renderer/lib/runValidation'
import { formatModelDisplay } from '@shared/llmProviders'

// TopBar per spec.md section 7: Project Name / Model / Run All. Run All is
// wired to PipelineService.runProject() (plan.md Phase 9) — same button
// relabels to "Resume" once a run has left the project paused/failed/
// completed_with_errors, since every step it runs is gated ("if not already
// done", spec.md 19.3), so Run and Resume are the exact same call. There's no
// Pause/Cancel while running — a project mid-run can only be deleted outright
// (PipelineService.stopAndWait(), projects.ipc.ts), not paused-and-kept, per
// product decision (Pause/Cancel behaved identically anyway).
export function TopBar(): JSX.Element {
  const navigate = useNavigate()
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id
  const { subscribe, run, isRunning, error } = usePipelineStore()
  const { items: queueItems, subscribe: subscribeQueue } = useQueueStore()
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)

  const [blockedReason, setBlockedReason] = useState<string | undefined>('Loading…')
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  useEffect(() => {
    if (projectId) subscribe(projectId)
  }, [projectId, subscribe])

  useEffect(() => {
    subscribeQueue()
  }, [subscribeQueue])

  useEffect(() => {
    if (!currentProject) return
    void getRunBlockedReason(currentProject).then(setBlockedReason)
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
  // A project sitting in the queue but not yet started still has a
  // pre-processing status — check queue membership too, not just `status`,
  // or a manual Run All here could race the queue reaching this same
  // project (see QueueService.drain()'s "already running" guard).
  const isQueued = queueItems.some((item) => item.projectId === projectId)
  const canRun = !isRunning && !isProcessing && !isQueued && !blockedReason

  const onRunOrResume = (): void => {
    if (!canRun) return
    void run(projectId)
  }

  const runLabel =
    status === ProjectStatus.FAILED || status === ProjectStatus.COMPLETED_WITH_ERRORS ? 'Retry Failed' : 'Run All'

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
          {formatModelDisplay(currentProject.selectedModelSnapshot ?? currentProject.selectedModel ?? '') || 'No model selected'}
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
            <Button variant="danger" type="button" onClick={() => setShowDeleteModal(true)}>
              <Trash2 size={14} />
              Delete
            </Button>
          </>
        ) : isCompleted ? (
          <span className="flex items-center gap-2 bg-surface-slate border border-border-subtle text-emerald-success font-body-sm text-body-sm px-4 py-1.5 rounded">
            <CircleCheck size={14} />
            Completed
          </span>
        ) : isPaused ? (
          <span className="flex items-center gap-2 bg-surface-slate border border-border-subtle text-tertiary font-body-sm text-body-sm px-4 py-1.5 rounded">
            Paused
          </span>
        ) : (
          <Button
            variant="primary"
            type="button"
            onClick={onRunOrResume}
            disabled={!canRun}
            title={blockedReason ?? (isQueued ? 'Waiting in the run queue' : undefined)}
          >
            <Play size={14} />
            {runLabel}
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
      {showDeleteModal && (
        <DeleteProjectModal
          project={currentProject}
          isRunning
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => navigate('/')}
        />
      )}
    </header>
  )
}
