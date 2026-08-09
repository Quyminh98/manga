import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clapperboard, Copy, CopyCheck, Image, RotateCw, Search } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { appApi } from '@renderer/lib/appApi'
import { formatErrorForDisplay } from '@renderer/lib/errorDisplay'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { getMissingPlaceholders } from '@shared/prompts'
import type { ScenePrompt, SrtBlock } from '@shared/entities'
import type { ScenePromptGenerationProgress } from '@shared/ipc-types'

// spec.md 8.5/24 — "PROMPT 001", zero-padded to 3 digits, same convention as
// src/main/pipeline/generateScenePrompt.ts's formatBlockNumber (duplicated
// rather than imported — that file lives in the Main process bundle).
function formatBlockNumber(blockIndex: number): string {
  return String(blockIndex).padStart(3, '0')
}

// spec.md 8.5 — Image Prompts: one card per SRT block (1:1), each showing
// SRT text / relevant characters / generated prompt / status / retry / copy,
// plus Search, Copy, Copy All. No Stitch screen exists for this page
// (plan.md Phase 8 — "chưa có trong Stitch") — built with Tailwind against
// DESIGN.md tokens, same convention as CharactersPage (Phase 6). "Generate
// Image Prompts" is a temporary manual trigger standing in for Run All
// (Phase 9), same pattern as "Split SRT" / "Detect Characters".
export function ImagePromptsPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const [blocks, setBlocks] = useState<SrtBlock[] | null>(null)
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[] | null>(null)
  const [search, setSearch] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [retryingBlockIndex, setRetryingBlockIndex] = useState<number | null>(null)
  const [copiedBlockIndex, setCopiedBlockIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missingPlaceholders, setMissingPlaceholders] = useState<string[]>([])
  const [progress, setProgress] = useState<ScenePromptGenerationProgress | null>(null)

  const refresh = useCallback(async (id: string) => {
    const [blockList, scenePromptList] = await Promise.all([appApi.srt.list(id), appApi.scenePrompts.list(id)])
    setBlocks(blockList)
    setScenePrompts(scenePromptList)
  }, [])

  useEffect(() => {
    setBlocks(null)
    setScenePrompts(null)
    setSearch('')
    setError(null)
    setProgress(null)
    if (projectId) void refresh(projectId)
  }, [projectId, refresh])

  useEffect(() => {
    void (async () => {
      const settings = await appApi.settings.get()
      setMissingPlaceholders(getMissingPlaceholders('sceneGeneration', settings.promptSettings.sceneGeneration))
    })()
  }, [])

  // Live "batch X / Y" progress while Generate Image Prompts is running —
  // each batch's results are merged into the list as soon as it lands,
  // instead of the whole list appearing only once generate() resolves.
  useEffect(() => {
    return appApi.scenePrompts.onProgress((p) => {
      setProgress(p)
      setScenePrompts((prev) => {
        const byBlockIndex = new Map((prev ?? []).map((sp) => [sp.blockIndex, sp]))
        for (const sp of p.batchResults) byBlockIndex.set(sp.blockIndex, sp)
        return Array.from(byBlockIndex.values()).sort((a, b) => a.blockIndex - b.blockIndex)
      })
    })
  }, [])

  const onGenerate = async (): Promise<void> => {
    if (!projectId) return
    setError(null)
    setProgress(null)
    setIsGenerating(true)
    try {
      const result = await appApi.scenePrompts.generate(projectId)
      setScenePrompts(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scene Prompt Generation failed.')
    } finally {
      setIsGenerating(false)
      setProgress(null)
    }
  }

  const onRetry = async (blockIndex: number): Promise<void> => {
    if (!projectId) return
    setError(null)
    setRetryingBlockIndex(blockIndex)
    try {
      const updated = await appApi.scenePrompts.retry(projectId, blockIndex)
      setScenePrompts((prev) => [...(prev ?? []).filter((sp) => sp.blockIndex !== blockIndex), updated])
    } catch (err) {
      setError(err instanceof Error ? `PROMPT ${formatBlockNumber(blockIndex)}: ${err.message}` : 'Retry failed.')
    } finally {
      setRetryingBlockIndex(null)
    }
  }

  const onCopy = async (blockIndex: number, prompt: string): Promise<void> => {
    await navigator.clipboard.writeText(prompt)
    setCopiedBlockIndex(blockIndex)
    setTimeout(() => setCopiedBlockIndex((current) => (current === blockIndex ? null : current)), 1500)
  }

  const scenePromptByBlockIndex = useMemo(() => {
    const map = new Map<number, ScenePrompt>()
    for (const sp of scenePrompts ?? []) map.set(sp.blockIndex, sp)
    return map
  }, [scenePrompts])

  const filteredBlocks = useMemo(() => {
    if (!blocks) return []
    const query = search.trim().toLowerCase()
    if (!query) return blocks
    return blocks.filter((block) => {
      const scenePrompt = scenePromptByBlockIndex.get(block.blockIndex)
      return (
        block.text.toLowerCase().includes(query) ||
        (scenePrompt?.prompt ?? '').toLowerCase().includes(query) ||
        (scenePrompt?.relevantCharacterIds ?? []).some((id) => id.toLowerCase().includes(query))
      )
    })
  }, [blocks, scenePromptByBlockIndex, search])

  const onCopyAll = async (): Promise<void> => {
    if (!blocks) return
    // spec.md 24 — same "PROMPT 00N:\n\n<prompt>" format used by image_prompts.txt export.
    const text = blocks
      .map((block) => scenePromptByBlockIndex.get(block.blockIndex))
      .filter((sp): sp is ScenePrompt => !!sp && sp.status === 'success' && !!sp.prompt)
      .map((sp) => `PROMPT ${formatBlockNumber(sp.blockIndex)}:\n\n${sp.prompt}`)
      .join('\n\n\n')
    await navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 1500)
  }

  if (!projectId) {
    return <div />
  }

  const generateBlockedReason = !blocks || blocks.length === 0
    ? 'Split the transcript into SRT blocks first'
    : missingPlaceholders.length > 0
      ? `Fix the Scene / Image Generation prompt in Settings > Prompts (missing ${missingPlaceholders.join(', ')})`
      : undefined

  const successCount = (scenePrompts ?? []).filter((sp) => sp.status === 'success').length

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Image Prompts</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            One generated image prompt per SRT block, mapped 1:1.
          </p>
        </div>
        <Button
          variant="primary"
          type="button"
          onClick={() => void onGenerate()}
          disabled={isGenerating || !!generateBlockedReason}
          title={generateBlockedReason}
        >
          <Clapperboard size={14} />
          {isGenerating ? 'Generating…' : 'Generate Image Prompts'}
        </Button>
      </div>

      {isGenerating && progress && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-body-sm text-body-sm text-text-secondary">
              Batch {progress.batchesCompleted} / {progress.totalBatches}
            </span>
            <span className="font-code-sm text-code-sm text-text-secondary">
              {progress.completedBlocks} / {progress.totalBlocks} prompts completed
            </span>
          </div>
          {/* DESIGN.md Components > Progress Indicators: thin 2px bar, emerald-success. */}
          <div className="h-0.5 w-full bg-surface-dim rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-success transition-all duration-300"
              style={{ width: `${Math.round((progress.completedBlocks / progress.totalBlocks) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {generateBlockedReason && missingPlaceholders.length > 0 && (
        <p className="mb-2 flex items-center gap-1.5 font-body-sm text-body-sm text-error">
          <AlertTriangle size={14} />
          {generateBlockedReason}
        </p>
      )}
      {error && <p className="mb-4 font-body-sm text-body-sm text-error">{formatErrorForDisplay(error)}</p>}

      {blocks === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      ) : blocks.length === 0 ? (
        <EmptyState
          icon={Image}
          title="No image prompts yet"
          description="Split the transcript into SRT blocks, then click Generate Image Prompts."
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="relative w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts…"
                className="w-full bg-surface-charcoal border border-border-subtle rounded pl-9 pr-3 py-2 font-body-sm text-body-sm text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-code-sm text-code-sm text-text-secondary">
                {successCount} / {blocks.length} generated
              </span>
              <Button variant="ghost" type="button" onClick={() => void onCopyAll()} disabled={successCount === 0}>
                {copiedAll ? <CopyCheck size={14} /> : <Copy size={14} />}
                {copiedAll ? 'Copied!' : 'Copy All'}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {filteredBlocks.map((block) => {
              const scenePrompt = scenePromptByBlockIndex.get(block.blockIndex)
              const isRetrying = retryingBlockIndex === block.blockIndex

              return (
                <div
                  key={block.id}
                  className="p-4 bg-surface-slate rounded border border-border-subtle hover:border-vilao-blue/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-headline-sm text-headline-sm text-text-primary">
                      PROMPT {formatBlockNumber(block.blockIndex)}
                    </span>
                    {scenePrompt?.status === 'success' && scenePrompt.prompt && (
                      <button
                        type="button"
                        onClick={() => void onCopy(block.blockIndex, scenePrompt.prompt!)}
                        className="flex items-center gap-1 font-body-sm text-body-sm text-text-secondary hover:text-vilao-blue transition-colors"
                      >
                        <Copy size={12} />
                        {copiedBlockIndex === block.blockIndex ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>

                  <div className="mb-3">
                    <p className="font-label-caps text-label-caps text-text-secondary uppercase mb-1">SRT Text</p>
                    <p className="font-body-md text-body-md text-text-primary">{block.text}</p>
                  </div>

                  <div className="mb-3">
                    <p className="font-label-caps text-label-caps text-text-secondary uppercase mb-1">Relevant Characters</p>
                    {scenePrompt && scenePrompt.relevantCharacterIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {scenePrompt.relevantCharacterIds.map((characterId) => (
                          <span
                            key={characterId}
                            className="bg-surface-dim border border-border-subtle text-vilao-blue font-code-sm text-code-sm px-2 py-0.5 rounded"
                          >
                            {characterId}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="font-body-sm text-body-sm text-text-secondary italic">None</p>
                    )}
                  </div>

                  <div>
                    <p className="font-label-caps text-label-caps text-text-secondary uppercase mb-1">Generated Prompt</p>
                    {!scenePrompt ? (
                      <p className="font-body-sm text-body-sm text-text-secondary italic">
                        Not generated yet — click &quot;Generate Image Prompts&quot;.
                      </p>
                    ) : scenePrompt.status === 'failed' ? (
                      <div className="flex items-start justify-between gap-3 bg-surface-dim border border-error/40 rounded p-3">
                        {scenePrompt.error ? (
                          <ErrorNotice error={scenePrompt.error} />
                        ) : (
                          <p className="font-body-sm text-body-sm text-error">Scene Prompt Generation failed.</p>
                        )}
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => void onRetry(block.blockIndex)}
                          disabled={isRetrying}
                        >
                          <RotateCw size={12} className={isRetrying ? 'animate-spin' : undefined} />
                          {isRetrying ? 'Retrying…' : 'Retry'}
                        </Button>
                      </div>
                    ) : (
                      <p className="font-code-sm text-code-sm text-text-primary bg-[#020617] border border-border-subtle rounded p-3 whitespace-pre-wrap">
                        {scenePrompt.prompt}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
