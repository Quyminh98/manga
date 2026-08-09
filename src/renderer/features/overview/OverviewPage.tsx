import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Captions, Cpu, FileText, Image as ImageIcon, LayoutDashboard, Sparkles, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { TaskStatus } from '@shared/enums'
import type { Character, CharacterPrompt, ScenePrompt, SrtBlock } from '@shared/entities'

interface MetricCardProps {
  label: string
  icon: LucideIcon
  value: string
  suffix?: string
  valueClassName?: string
  progressPercent?: number
}

function MetricCard({ label, icon: Icon, value, suffix, valueClassName, progressPercent }: MetricCardProps): JSX.Element {
  return (
    <Card className="relative overflow-hidden pb-7">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-label-caps text-label-caps text-text-secondary uppercase tracking-wider">{label}</h3>
        <Icon size={16} className="text-text-secondary/50" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-code-sm text-headline-md font-medium ${valueClassName ?? 'text-text-primary'}`}>{value}</span>
        {suffix && <span className="font-body-sm text-body-sm text-text-secondary">{suffix}</span>}
      </div>
      {progressPercent !== undefined && (
        // DESIGN.md Components > Progress Indicators: thin 2px bar, emerald-success.
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-surface-container-high">
          <div className="h-full bg-emerald-success" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
    </Card>
  )
}

// spec.md 8.1 — Overview stats computed from the real DB via the same list
// endpoints ProcessingPage already uses (no dedicated aggregate IPC), so the
// numbers here always match a direct sqlite3 query. progressPercent uses the
// exact formula as ProcessingPage/listProjectSummaries: (character prompts +
// scene prompts done) / (characters + srt blocks).
export function OverviewPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const [srtBlocks, setSrtBlocks] = useState<SrtBlock[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [characterPrompts, setCharacterPrompts] = useState<CharacterPrompt[]>([])
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[]>([])
  const [loaded, setLoaded] = useState(false)

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
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (projectId) void refresh(projectId)
  }, [projectId, refresh])

  if (!currentProject || !projectId) {
    return <div />
  }

  if (!loaded) {
    return <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
  }

  const hasAnyData = currentProject.transcript.length > 0 || srtBlocks.length > 0

  const characterPromptDone = characterPrompts.filter((p) => p.status === TaskStatus.SUCCESS).length
  const characterPromptFailed = characterPrompts.filter((p) => p.status === TaskStatus.FAILED).length
  const scenePromptDone = scenePrompts.filter((sp) => sp.status === TaskStatus.SUCCESS).length
  const scenePromptFailed = scenePrompts.filter((sp) => sp.status === TaskStatus.FAILED).length
  const failedCount = characterPromptFailed + scenePromptFailed

  const totalUnits = characters.length + srtBlocks.length
  const doneUnits = characterPromptDone + scenePromptDone
  const overallProgress = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0

  const characterPromptPercent = characters.length > 0 ? Math.round((characterPromptDone / characters.length) * 100) : 0
  const scenePromptPercent = srtBlocks.length > 0 ? Math.round((scenePromptDone / srtBlocks.length) * 100) : 0

  return (
    <div>
      <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Overview</h2>
      <p className="font-body-md text-body-md text-text-secondary mb-8">
        Project stats — transcript, SRT, characters, prompts and overall progress.
      </p>

      {!hasAnyData ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No project data yet"
          description="Paste a transcript and run the pipeline to see project stats here."
        />
      ) : (
        <>
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border-subtle">
            <h3 className="font-headline-md text-headline-md text-text-primary">{currentProject.name}</h3>
            <div className="flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-md border border-border-subtle">
              <Cpu size={14} className="text-text-secondary" />
              <span className="font-code-sm text-code-sm text-text-secondary">
                {currentProject.selectedModelSnapshot ?? currentProject.selectedModel ?? 'No model selected'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <MetricCard
              label="Transcript"
              icon={FileText}
              value={currentProject.transcript.length.toLocaleString()}
              suffix="characters"
            />
            <MetricCard label="SRT" icon={Captions} value={srtBlocks.length.toLocaleString()} suffix="blocks" />
            <MetricCard label="Characters" icon={Users} value={characters.length.toLocaleString()} suffix="identified" />
            <MetricCard
              label="Character Prompt"
              icon={Sparkles}
              value={`${characterPromptDone} / ${characters.length}`}
              progressPercent={characterPromptPercent}
            />
            <MetricCard
              label="Image Prompt"
              icon={ImageIcon}
              value={`${scenePromptDone} / ${srtBlocks.length}`}
              progressPercent={scenePromptPercent}
            />
            <MetricCard
              label="Failed"
              icon={AlertTriangle}
              value={failedCount.toLocaleString()}
              suffix="tasks"
              valueClassName="text-error"
            />
          </div>

          <Card className="p-8 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-text-primary">Overall Progress</h3>
                <p className="font-body-sm text-body-sm text-text-secondary mt-1">AI Generation Pipeline Status</p>
              </div>
              <span className="font-code-sm text-headline-lg font-bold text-text-primary tracking-tighter">
                {overallProgress}%
              </span>
            </div>
            {/* DESIGN.md Components > Progress Indicators: thin 2px bar, emerald-success. */}
            <div className="w-full h-0.5 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-success rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
