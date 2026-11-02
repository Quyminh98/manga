import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, AlertTriangle, Check, CircleDot, Loader2, Minus, RotateCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { appApi } from '@renderer/lib/appApi'
import { formatErrorForDisplay } from '@renderer/lib/errorDisplay'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { usePipelineStore } from '@renderer/stores/usePipelineStore'
import { ProjectStatus, TaskStatus, TaskType } from '@shared/enums'
import type { Character, CharacterPrompt, PipelineTask, ScenePrompt, SrtBlock } from '@shared/entities'
import { getRunBlockedReason } from '@renderer/lib/runValidation'

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
// copy of that state).
//
// Cập nhật (Phase 15, ngoài phạm vi V1 gốc): the Run All/Resume/Retry
// Failed/Processing…/Completed/Paused/Delete cluster spec.md 8.6 originally
// had here is gone — it duplicated TopBar.tsx exactly (same
// usePipelineStore state), and TopBar is visible from every project
// sub-page including this one, so it's the single place for that now. This
// tab is display-only: task/progress status, no actions.
export function ProcessingPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id
  const { subscribe, tasks, isRunning, error } = usePipelineStore()

  const [srtBlocks, setSrtBlocks] = useState<SrtBlock[] | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [characterPrompts, setCharacterPrompts] = useState<CharacterPrompt[]>([])
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[]>([])
  const [blockedReason, setBlockedReason] = useState<string | undefined>('Loading…')

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

  // Bug fix (user report): the 3 coarse steps (Split SRT/Detect Characters/
  // Generate Character Prompts) only push live updates through `tasks`, not
  // a dedicated per-row channel — refetch srtBlocks/characters/
  // characterPrompts whenever a coarse step reports progress. This is what
  // actually covers a *queue*-triggered run (a brand-new project's only
  // real starting path, spec.md 6.4): `isRunning` below is a per-window flag
  // that only ever becomes true when *this* window called run() itself, so
  // for a queue-triggered run srtBlocks stayed stuck at whatever it was at
  // mount (often still empty) for the entire run — the Scene Tasks list
  // never rendered, and the Scene Generation card never left 0/0, until the
  // user left and reopened the project (a fresh mount). Same fix
  // OverviewPage.tsx already got in Phase 16 for the exact same reason.
  useEffect(() => {
    if (projectId) void refresh(projectId)
  }, [tasks, projectId, refresh])

  // Once a run finishes (isRunning flips back to false), pull a final
  // authoritative snapshot of everything — extra safety net for a run
  // started directly from this window (the case above already covers it,
  // but this catches anything that only changes between the last `tasks`
  // update and the run truly settling, e.g. the final export step).
  useEffect(() => {
    if (!isRunning && projectId) void refresh(projectId)
  }, [isRunning, projectId, refresh])

  useEffect(() => {
    if (!currentProject) return
    void getRunBlockedReason(currentProject).then(setBlockedReason)
  }, [currentProject])

  const taskByType = useMemo(() => new Map(tasks.map((t: PipelineTask) => [t.taskType, t])), [tasks])

  if (!projectId || !currentProject) {
    return <div />
  }

  const isProcessing = currentProject.status === ProjectStatus.PROCESSING
  const hasStarted = srtBlocks !== null && srtBlocks.length > 0

  const scenePromptByBlockIndex = new Map(scenePrompts.map((sp) => [sp.blockIndex, sp]))
  const sceneSuccessCount = scenePrompts.filter((sp) => sp.status === TaskStatus.SUCCESS).length
  const sceneFailedCount = scenePrompts.filter((sp) => sp.status === TaskStatus.FAILED).length
  const characterPromptSuccessCount = characterPrompts.filter((p) => p.status === TaskStatus.SUCCESS).length

  const totalUnits = characters.length + (srtBlocks?.length ?? 0)
  const doneUnits = characterPromptSuccessCount + sceneSuccessCount
  const overallProgress = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0

  // Phase 21 — a hasCharacters=false project's DETECT_CHARACTERS/
  // GENERATE_CHARACTER_PROMPTS tasks are marked success immediately (no real
  // work, PipelineService.runProjectInternal) — hide those 2 cards rather
  // than show a trivial "Success" for a step that never actually ran.
  const coarseSteps = currentProject.hasCharacters
    ? COARSE_STEPS
    : COARSE_STEPS.filter((s) => s.taskType === TaskType.SPLIT_SRT)

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Processing</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Pipeline task status — Run All executes spec.md 36&apos;s flow end to end.
        </p>
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
          description="Use Run All in the top bar to execute Split SRT, Character Detection, Character Prompts and Scene Generation end to end."
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
            {coarseSteps.map(({ taskType, label }) => {
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
              //
              // `isRunning` on its own also isn't enough on the *other*
              // side — it's a client-local flag, only true if THIS renderer
              // called run() itself. A queue-triggered run of a project
              // whose Processing tab happens to be open never sets it, so
              // this card was stuck on "Pending" for the entire Scene
              // Generation phase despite TopBar correctly showing
              // "Processing…" (found via a live queue-run screenshot).
              // `isProcessing` (from currentProject.status, kept in sync
              // regardless of who triggered the run) covers that case.
              const sceneTotal = srtBlocks?.length ?? 0
              const scenePhaseReached = taskByType.get(TaskType.GENERATE_CHARACTER_PROMPTS)?.status === TaskStatus.SUCCESS
              const sceneAllDone = sceneTotal > 0 && sceneSuccessCount + sceneFailedCount === sceneTotal

              let Icon: LucideIcon = Minus
              let colorClass = 'text-text-secondary'
              let label = 'Pending'
              if (scenePhaseReached) {
                if ((isRunning || isProcessing) && !sceneAllDone) {
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
