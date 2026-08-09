import { useCallback, useEffect, useMemo, useState } from 'react'
import { Captions, Scissors, Search } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import type { SrtBlock } from '@shared/entities'

// spec.md 22 SRT timestamp format: 00:00:03,000
function formatSrtTimestamp(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

// spec.md 8.3 — SRT block list with fake timestamp + search. "Split SRT" is
// a temporary manual trigger (plan.md Phase 5) standing in for Run All,
// which arrives in Phase 9.
export function SrtPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const [blocks, setBlocks] = useState<SrtBlock[] | null>(null)
  const [search, setSearch] = useState('')
  const [isSplitting, setIsSplitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (id: string) => {
    const list = await appApi.srt.list(id)
    setBlocks(list)
  }, [])

  useEffect(() => {
    setBlocks(null)
    setSearch('')
    if (projectId) void refresh(projectId)
  }, [projectId, refresh])

  const onSplit = async (): Promise<void> => {
    if (!projectId) return
    setError(null)
    setIsSplitting(true)
    try {
      const result = await appApi.srt.split(projectId)
      setBlocks(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to split transcript into SRT blocks.')
    } finally {
      setIsSplitting(false)
    }
  }

  const filteredBlocks = useMemo(() => {
    if (!blocks) return []
    const query = search.trim().toLowerCase()
    if (!query) return blocks
    return blocks.filter((block) => block.text.toLowerCase().includes(query))
  }, [blocks, search])

  if (!projectId) {
    return <div />
  }

  const hasTranscript = (currentProject?.transcript ?? '').trim().length > 0

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">SRT</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            Fake-timeline SRT blocks generated from the transcript — no LLM involved.
          </p>
        </div>
        <Button
          variant="primary"
          type="button"
          onClick={() => void onSplit()}
          disabled={isSplitting || !hasTranscript}
          title={hasTranscript ? undefined : 'Add a transcript first'}
        >
          <Scissors size={14} />
          {isSplitting ? 'Splitting…' : 'Split SRT'}
        </Button>
      </div>

      {error && <p className="mb-4 font-body-sm text-body-sm text-error">{error}</p>}

      {blocks === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      ) : blocks.length === 0 ? (
        <EmptyState
          icon={Captions}
          title="No SRT blocks yet"
          description="Add a transcript, then click Split SRT to generate fake-timeline blocks."
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="relative w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SRT text…"
                className="w-full bg-surface-charcoal border border-border-subtle rounded pl-9 pr-3 py-2 font-body-sm text-body-sm text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
            </div>
            <span className="font-code-sm text-code-sm text-text-secondary">
              {filteredBlocks.length} / {blocks.length} blocks
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {filteredBlocks.map((block) => (
              <div
                key={block.id}
                className="p-4 bg-surface-slate rounded border border-border-subtle hover:border-vilao-blue/50 transition-colors"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-code-sm text-code-sm text-text-secondary">{block.blockIndex}</span>
                  <div className="flex gap-2 font-code-sm text-code-sm text-text-secondary">
                    <span>{formatSrtTimestamp(block.startMs)}</span>
                    <span>--&gt;</span>
                    <span>{formatSrtTimestamp(block.endMs)}</span>
                  </div>
                </div>
                <p className="font-body-md text-body-md text-text-primary">{block.text}</p>
                <div className="mt-3 font-code-sm text-code-sm text-text-secondary text-right">
                  {block.characterCount} chars
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
