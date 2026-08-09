import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  CircleDot,
  Loader2,
  Minus,
  Octagon,
  Pause,
  Play,
  RotateCw
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { Card } from '@renderer/components/ui/Card'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { appApi } from '@renderer/lib/appApi'
import { formatErrorForDisplay } from '@renderer/lib/errorDisplay'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { usePipelineStore } from '@renderer/stores/usePipelineStore'
import { ProjectStatus, TaskStatus, TaskType } from '@shared/enums'
import type { Character, CharacterPrompt, PipelineTask, ScenePrompt, SrtBlock } from '@shared/entities'
import { validateProjectForRun } from '@shared/validateRun'

const COARSE_STEPS: { taskType: TaskType; label: string }[] = [
  { taskType: TaskType.SPLIT_SRT, label: 'Split SRT' },
  { taskType: TaskType.DETECT_CHARACTERS, label: 'Detect Characters' },
  { taskType: TaskType.GENERATE_CHARACTER_PROMPTS, label: 'Generate Character Prompts' }
]

// spec.md 8.6 status icons: ○ Pending ● Running ✓ Success ! Failed ↻ Retrying
// — Retrying/Skipped are UI-derived, not stored (schema.md Conventions).
// "Retrying" only applies to the 3 coarse steps below, which persist a real
// `running` row while in flight (PipelineService.runProject()) — Character/
// Scene Prompt batches only ever persist their final success/failed state
// (Phase 7/8's atomic-batch design), so a per-scene row can't distinguish
// "currently retrying" from "hasn't started yet" beyond what `isRunning`
// already conveys at the page level.
function statusIcon(status: TaskStatus): { Icon: LucideIcon; className: string; label: string } {
  switch (status) {
    case TaskStatus.SUCCESS:
      return { Icon: Check, className: 'text-emerald-success', label: 'Success' }
    case TaskStatus.RUNNING:
      return { Icon: CircleDot, className: 'text-vilao-blue', label: 'Running' }
    case TaskStatus.FAILED:
      return { Icon: AlertCircle, className: 'text-error', label: 'Failed' }
    default:
      return { Icon: Minus, className: 'text-text-secondary', label: 'Pending' }
  }
}

// spec.md 8.6 — Processing tab: 3 coarse project-level steps (real
// pipeline_tasks rows via PipelineService.listTasks) + one row per SRT block
// for Scene Generation (read straight from scenePrompts.list(), already 1:1
// with srt_blocks and already carrying status/attempts/error — no second
// copy of that state). Actions: Run All/Resume/Retry Failed (same call,
// spec.md 19.3), Pause, Cancel — shared with TopBar via usePipelineStore so
// both surfaces always agree on whether a run is in flight.
export function ProcessingPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id
  const { subscribe, tasks, run, pause, cancel, isRunning, error } = usePipelineStore()

  const [srtBlocks, setSrtBlocks] = useState<SrtBlock[] | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [characterPrompts, setCharacterPrompts] = useState<CharacterPrompt[]>([])
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[]>([])
  const [blockedReason, setBlockedReason] = useState<string | undefined>('Loading…')
  const [isPausing, setIsPausing] = useState(false)

  const refresh = useCallback(async (id: string) => {
    const [blocks, characterList, promptList, sceneList] = await Promise.all([
      appApi.srt.list(id),
      appApi.characters.list(id),
      appApi.characters.listPrompts(id),
      appApi.scenePrompts.list(id)
    ])
    setSrtBlocks(blocks)
    setCharacters(characterList)
    setCharacterPrompts(promptList)
    setScenePrompts(sceneList)
  }, [])

  useEffect(() => {
    if (!projectId) return
    subscribe(projectId)
    void refresh(projectId)
  }, [projectId, subscribe, refresh])

  // Live scene progress reuses the exact same channel as Image Prompts
  // (ScenePromptService.generate()'s onProgress) — merges each finished
  // batch's rows in as soon as they land instead of waiting for Run All to
  // fully resolve.
  useEffect(() => {
    return appApi.scenePrompts.onProgress((p) => {
      setScenePrompts((prev) => {
        const byBlockIndex = new Map(prev.map((sp) => [sp.blockIndex, sp]))
        for (const sp of p.batchResults) byBlockIndex.set(sp.blockIndex, sp)
        return Array.from(byBlockIndex.values()).sort((a, b) => a.blockIndex - b.blockIndex)
      })
    })
  }, [])

  // Once a run finishes (isRunning flips back to false), pull a final
  // authoritative snapshot of everything — covers steps that don't have a
  // live per-row progress channel (Character Detection/Generation).
  useEffect(() => {
    if (!isRunning && projectId) void refresh(projectId)
  }, [isRunning, projectId, refresh])

  useEffect(() => {
    if (!currentProject) return
    void (async () => {
      const [settings, hasApiKey] = await Promise.all([appApi.settings.get(), appApi.vilao.hasApiKey()])
      setBlockedReason(
        validateProjectForRun(currentProject, settings.promptSettings, hasApiKey, settings.selectedModel) ?? undefined
      )
    })()
  }, [currentProject])

  const taskByType = useMemo(() => new Map(tasks.map((t: PipelineTask) => [t.taskType, t])), [tasks])

  if (!projectId || !currentProject) {
    return <div />
  }

  const status = currentProject.status
  const isProcessing = status === ProjectStatus.PROCESSING
  const isPaused = status === ProjectStatus.PAUSED
  const isCompleted = status === ProjectStatus.COMPLETED
  const canRun = !isRunning && !isProcessing && !isCompleted && !blockedReason
  const hasStarted = srtBlocks !== null && srtBlocks.length > 0

  const runLabel =
    status === ProjectStatus.DRAFT || status === ProjectStatus.READY
      ? 'Run All'
      : status === ProjectStatus.FAILED || status === ProjectStatus.COMPLETED_WITH_ERRORS
        ? 'Retry Failed'
        : 'Resume'

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

  const scenePromptByBlockIndex = new Map(scenePrompts.map((sp) => [sp.blockIndex, sp]))
  const sceneSuccessCount = scenePrompts.filter((sp) => sp.status === TaskStatus.SUCCESS).length
  const sceneFailedCount = scenePrompts.filter((sp) => sp.status === TaskStatus.FAILED).length
  const characterPromptSuccessCount = characterPrompts.filter((p) => p.status === TaskStatus.SUCCESS).length

  const totalUnits = characters.length + (srtBlocks?.length ?? 0)
  const doneUnits = characterPromptSuccessCount + sceneSuccessCount
  const overallProgress = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Processing</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            Pipeline task status — Run All executes spec.md 36&apos;s flow end to end.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isProcessing || isRunning ? (
            <>
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
              <Check size={14} />
              Completed
            </span>
          ) : (
            <Button variant="primary" type="button" onClick={onRunOrResume} disabled={!canRun} title={blockedReason}>
              <Play size={14} />
              {isPaused ? 'Resume' : runLabel}
            </Button>
          )}
        </div>
      </div>

      {blockedReason && !isProcessing && !isRunning && (
        <p className="mb-4 flex items-center gap-1.5 font-body-sm text-body-sm text-error">
          <AlertTriangle size={14} />
          {blockedReason}
        </p>
      )}
      {error && <p className="mb-4 font-body-sm text-body-sm text-error">{formatErrorForDisplay(error)}</p>}

      {!hasStarted && !isRunning && !isProcessing ? (
        <EmptyState
          icon={Activity}
          title="Pipeline hasn&apos;t run yet"
          description="Click Run All to execute Split SRT, Character Detection, Character Prompts and Scene Generation end to end."
        />
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex justify-between items-end mb-3">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-text-secondary uppercase">Overall Progress</span>
                <span className="font-headline-md text-headline-md text-text-primary">{overallProgress}%</span>
              </div>
              <span className="font-code-sm text-code-sm text-text-secondary">
                {doneUnits} / {totalUnits} units
              </span>
            </div>
            {/* DESIGN.md Components > Progress Indicators: thin 2px bar, emerald-success. */}
            <div className="w-full h-0.5 bg-surface-container-low rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-success rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {COARSE_STEPS.map(({ taskType, label }) => {
              const task = taskByType.get(taskType)
              const { Icon, className, label: statusLabel } = statusIcon(task?.status ?? TaskStatus.PENDING)
              return (
                <Card key={taskType} className={task?.status === TaskStatus.RUNNING ? 'ring-1 ring-vilao-blue/50' : undefined}>
                  <div className="flex justify-between items-start mb-3">
                    <div className={`w-8 h-8 rounded bg-surface-charcoal border border-border-subtle flex items-center justify-center ${className}`}>
                      <Icon size={16} className={task?.status === TaskStatus.RUNNING ? 'animate-pulse' : undefined} />
                    </div>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-text-primary mb-1">{label}</h3>
                  <p className={`font-code-sm text-code-sm ${className}`}>{statusLabel}</p>
                  {task?.error && <ErrorNotice error={task.error} className="mt-1" />}
                </Card>
              )
            })}

            {(() => {
              // Scene Generation only actually starts once PipelineService
              // has cleared every gate before it (spec.md 36 runs the steps
              // strictly in order) — `isRunning` alone stays true for the
              // *entire* Run All call, so using it on its own here made this
              // card show "Running" from the moment Run All was clicked,
              // even while Detect Characters/Character Prompts were still in
              // progress. Gate on GENERATE_CHARACTER_PROMPTS actually being
              // `success` first.
              const sceneTotal = srtBlocks?.length ?? 0
              const scenePhaseReached = taskByType.get(TaskType.GENERATE_CHARACTER_PROMPTS)?.status === TaskStatus.SUCCESS
              const sceneAllDone = sceneTotal > 0 && sceneSuccessCount + sceneFailedCount === sceneTotal

              let Icon: LucideIcon = Minus
              let colorClass = 'text-text-secondary'
              let label = 'Pending'
              if (scenePhaseReached) {
                if (isRunning && !sceneAllDone) {
                  Icon = Loader2
                  colorClass = 'text-vilao-blue'
                  label = 'Running'
                } else if (sceneFailedCount > 0) {
                  Icon = AlertCircle
                  colorClass = 'text-error'
                  label = 'Failed'
                } else if (sceneAllDone) {
                  Icon = Check
                  colorClass = 'text-emerald-success'
                  label = 'Success'
                }
              }

              return (
                <Card className={label === 'Running' ? 'ring-1 ring-vilao-blue/50' : undefined}>
                  <div className="flex justify-between items-start mb-3">
                    <div className={`w-8 h-8 rounded bg-surface-charcoal border border-border-subtle flex items-center justify-center ${colorClass}`}>
                      <Icon size={16} className={label === 'Running' ? 'animate-spin' : undefined} />
                    </div>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-text-primary mb-1">Scene Generation</h3>
                  <p className={`font-code-sm text-code-sm ${colorClass}`}>{label}</p>
                  <p className="mt-1 font-code-sm text-code-sm text-text-secondary">
                    {sceneSuccessCount} / {sceneTotal} scenes
                    {sceneFailedCount > 0 ? ` · ${sceneFailedCount} failed` : ''}
                  </p>
                </Card>
              )
            })()}
          </div>

          {srtBlocks && srtBlocks.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-border-subtle bg-surface-charcoal/50">
                <h3 className="font-label-caps text-label-caps text-text-secondary uppercase">Scene Tasks</h3>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-border-subtle">
                {srtBlocks.map((block) => {
                  const scenePrompt = scenePromptByBlockIndex.get(block.blockIndex)
                  const { Icon, className, label } = statusIcon(scenePrompt?.status ?? TaskStatus.PENDING)
                  return (
                    <div key={block.id} className="px-5 py-2.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon size={14} className={className} />
                        <span className="font-code-sm text-code-sm text-text-primary shrink-0">
                          Scene {String(block.blockIndex).padStart(3, '0')}
                        </span>
                        {scenePrompt?.error && <ErrorNotice error={scenePrompt.error} className="truncate" />}
                      </div>
                      <span className={`font-code-sm text-code-sm shrink-0 ${className}`}>
                        {scenePrompt && scenePrompt.attempts > 1 && scenePrompt.status === TaskStatus.FAILED ? (
                          <span className="flex items-center gap-1">
                            <RotateCw size={12} />
                            {label} ({scenePrompt.attempts}x)
                          </span>
                        ) : (
                          label
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
