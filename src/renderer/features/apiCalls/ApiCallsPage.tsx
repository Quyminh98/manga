import { useCallback, useEffect, useRef, useState } from 'react'
import { Gauge } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { TaskType } from '@shared/enums'
import { formatModelDisplay } from '@shared/llmProviders'
import type { LlmCallGroup, LlmCallStats } from '@shared/ipc-types'

const STEP_LABELS: Record<string, string> = {
  [TaskType.DETECT_CHARACTERS]: 'Character Detection',
  [TaskType.GENERATE_CHARACTER_PROMPTS]: 'Character Prompts',
  [TaskType.SELECT_RELEVANT_CHARACTERS]: 'Relevant Character Selection',
  [TaskType.GENERATE_SCENE_PROMPT]: 'Scene Prompts'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`
}

function formatTokens(n: number): string {
  return n > 0 ? n.toLocaleString() : '—'
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'error' | 'success' }): JSX.Element {
  const toneClass = tone === 'error' ? 'text-error' : tone === 'success' ? 'text-emerald-success' : 'text-text-primary'
  return (
    <Card>
      <p className="font-label-caps text-label-caps text-text-secondary mb-2">{label}</p>
      <p className={`font-headline-md text-headline-md ${toneClass}`}>{value}</p>
    </Card>
  )
}

function GroupTable({
  title,
  firstColumn,
  rows,
  formatKey
}: {
  title: string
  firstColumn: string
  rows: LlmCallGroup[]
  formatKey: (key: string) => string
}): JSX.Element {
  return (
    <Card>
      <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-subtle font-label-caps text-label-caps text-text-secondary">
              <th className="py-2 pr-4 font-normal">{firstColumn}</th>
              <th className="py-2 pr-4 font-normal text-right">CALLS</th>
              <th className="py-2 pr-4 font-normal text-right">FAILED</th>
              <th className="py-2 pr-4 font-normal text-right">TIME</th>
              <th className="py-2 font-normal text-right">TOKENS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border-subtle last:border-b-0 font-body-sm text-body-sm">
                <td className="py-2 pr-4 text-text-primary">{formatKey(row.key)}</td>
                <td className="py-2 pr-4 text-right text-text-primary">{row.calls}</td>
                <td className={`py-2 pr-4 text-right ${row.failed > 0 ? 'text-error' : 'text-text-secondary'}`}>{row.failed}</td>
                <td className="py-2 pr-4 text-right text-text-secondary">{formatDuration(row.durationMs)}</td>
                <td className="py-2 text-right text-text-secondary">{formatTokens(row.totalTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// Phase 27 — per-project API Calls tab: how many times this project called a
// model (every retry counts), split by pipeline step and model, plus the most
// recent calls. Refetches live (debounced) on `llmCalls:changedEvent`, which
// Main fires after each logged call — so it also follows queue-triggered runs.
export function ApiCallsPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id
  const [stats, setStats] = useState<LlmCallStats | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async (id: string) => {
    setStats(await appApi.llmCalls.stats(id))
  }, [])

  useEffect(() => {
    if (projectId) void refresh(projectId)
  }, [projectId, refresh])

  useEffect(() => {
    if (!projectId) return
    const unsubscribe = appApi.llmCalls.onChanged((changedId) => {
      if (changedId !== projectId) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void refresh(projectId), 400)
    })
    return () => {
      unsubscribe()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [projectId, refresh])

  if (!projectId) return <div />

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">API Calls</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Every request this project sent to a model, including retries. Token totals appear only when the provider
          reports usage.
        </p>
      </div>

      {stats === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      ) : stats.totalCalls === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No model calls yet"
          description="Calls are logged while the pipeline runs. Projects that ran before this tab existed have no history."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="TOTAL CALLS" value={stats.totalCalls.toLocaleString()} />
            <StatTile label="SUCCESSFUL" value={stats.successCalls.toLocaleString()} tone="success" />
            <StatTile
              label="FAILED"
              value={`${stats.failedCalls.toLocaleString()} (${Math.round((stats.failedCalls / stats.totalCalls) * 100)}%)`}
              tone={stats.failedCalls > 0 ? 'error' : undefined}
            />
            <StatTile label="TOTAL TIME" value={formatDuration(stats.totalDurationMs)} />
          </div>
          {stats.totalTokens > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <StatTile label="PROMPT TOKENS" value={stats.promptTokens.toLocaleString()} />
              <StatTile label="COMPLETION TOKENS" value={stats.completionTokens.toLocaleString()} />
              <StatTile label="TOTAL TOKENS" value={stats.totalTokens.toLocaleString()} />
            </div>
          )}

          <GroupTable title="By Pipeline Step" firstColumn="STEP" rows={stats.byStep} formatKey={(k) => STEP_LABELS[k] ?? k} />
          <GroupTable title="By Model" firstColumn="MODEL" rows={stats.byModel} formatKey={formatModelDisplay} />

          <Card>
            <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">
              Recent Calls
              {stats.totalCalls > stats.recent.length && (
                <span className="ml-2 font-body-sm text-body-sm text-text-secondary">
                  (latest {stats.recent.length} of {stats.totalCalls})
                </span>
              )}
            </h3>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border-subtle font-label-caps text-label-caps text-text-secondary">
                    <th className="py-2 pr-4 font-normal">TIME</th>
                    <th className="py-2 pr-4 font-normal">STEP</th>
                    <th className="py-2 pr-4 font-normal">MODEL</th>
                    <th className="py-2 pr-4 font-normal">RESULT</th>
                    <th className="py-2 pr-4 font-normal text-right">DURATION</th>
                    <th className="py-2 font-normal text-right">TOKENS</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((call) => (
                    <tr key={call.id} className="border-b border-border-subtle last:border-b-0 font-body-sm text-body-sm align-top">
                      <td className="py-2 pr-4 text-text-secondary whitespace-nowrap">
                        {new Date(call.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-4 text-text-primary">{STEP_LABELS[call.step] ?? call.step}</td>
                      <td className="py-2 pr-4 text-text-secondary">{formatModelDisplay(call.model)}</td>
                      <td className={`py-2 pr-4 ${call.status === 'failed' ? 'text-error' : 'text-emerald-success'}`}>
                        {call.status === 'failed' ? (call.error ?? 'Failed') : 'Success'}
                      </td>
                      <td className="py-2 pr-4 text-right text-text-secondary whitespace-nowrap">
                        {formatDuration(call.durationMs)}
                      </td>
                      <td className="py-2 text-right text-text-secondary">{formatTokens(call.totalTokens ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
