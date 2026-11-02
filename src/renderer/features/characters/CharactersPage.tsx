import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, RotateCw, Search, Users } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { appApi } from '@renderer/lib/appApi'
import { formatErrorForDisplay } from '@renderer/lib/errorDisplay'
import { usePipelineStore } from '@renderer/stores/usePipelineStore'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { ProjectStatus } from '@shared/enums'
import type { Character, CharacterPrompt } from '@shared/entities'

// spec.md 8.4 — Character Database. Detection and prompt generation are
// driven by Run All (Phase 9); this page displays results and lets the user
// retry an individual failed Character Prompt. No Stitch screen exists for
// this page (generate_screen_from_text timed out twice in Phase 6, see
// plan.md) — built directly with Tailwind against DESIGN.md tokens, so the
// Character Prompt column added in Phase 7 follows that same convention
// rather than Stitch's edit_screens.
export function CharactersPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id
  // Main rejects a manual Retry while the project is running (Phase 29) —
  // disable it here too so the user doesn't hit that error.
  const isPipelineRunning = usePipelineStore((state) => state.isRunning)
  const isProcessing = isPipelineRunning || currentProject?.status === ProjectStatus.PROCESSING

  const [characters, setCharacters] = useState<Character[] | null>(null)
  const [prompts, setPrompts] = useState<CharacterPrompt[] | null>(null)
  const [search, setSearch] = useState('')
  const [retryingCharacterId, setRetryingCharacterId] = useState<string | null>(null)
  const [copiedCharacterId, setCopiedCharacterId] = useState<string | null>(null)
  const [promptsError, setPromptsError] = useState<string | null>(null)

  const refresh = useCallback(async (id: string) => {
    const [characterList, promptList] = await Promise.all([
      appApi.characters.list(id),
      appApi.characters.listPrompts(id)
    ])
    setCharacters(characterList)
    setPrompts(promptList)
  }, [])

  useEffect(() => {
    setCharacters(null)
    setPrompts(null)
    setSearch('')
    setPromptsError(null)
    if (projectId) void refresh(projectId)
  }, [projectId, refresh])

  const onRetryPrompt = async (characterId: string): Promise<void> => {
    if (!projectId) return
    setPromptsError(null)
    setRetryingCharacterId(characterId)
    try {
      const updated = await appApi.characters.retryPrompt(projectId, characterId)
      setPrompts((prev) => [...(prev ?? []).filter((p) => p.characterId !== characterId), updated])
    } catch (err) {
      setPromptsError(err instanceof Error ? `${characterId}: ${err.message}` : `${characterId}: Retry failed.`)
    } finally {
      setRetryingCharacterId(null)
    }
  }

  const onCopyPrompt = async (characterId: string, prompt: string): Promise<void> => {
    await navigator.clipboard.writeText(prompt)
    setCopiedCharacterId(characterId)
    setTimeout(() => setCopiedCharacterId((current) => (current === characterId ? null : current)), 1500)
  }

  const promptByCharacterId = useMemo(() => {
    const map = new Map<string, CharacterPrompt>()
    for (const prompt of prompts ?? []) map.set(prompt.characterId, prompt)
    return map
  }, [prompts])

  const filteredCharacters = useMemo(() => {
    if (!characters) return []
    const query = search.trim().toLowerCase()
    if (!query) return characters
    return characters.filter(
      (c) =>
        c.characterId.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query) ||
        c.role.toLowerCase().includes(query)
    )
  }, [characters, search])

  if (!projectId) {
    return <div />
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Characters</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Character Database and reference prompts detected from the transcript.
        </p>
      </div>

      {promptsError && <p className="mb-4 font-body-sm text-body-sm text-error">{formatErrorForDisplay(promptsError)}</p>}

      {characters === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      ) : currentProject?.hasCharacters === false ? (
        // Phase 21 — belt-and-suspenders for direct URL navigation; the
        // Characters nav item itself is already hidden by Sidebar.tsx.
        <EmptyState
          icon={Users}
          title="This channel doesn't use characters"
          description="This project's channel is configured without story characters — Character Detection and Character Prompt Generation are skipped."
        />
      ) : characters.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No characters detected yet"
          description="Run All detects characters from the transcript and builds this list automatically."
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="relative w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search characters…"
                className="w-full bg-surface-charcoal border border-border-subtle rounded pl-9 pr-3 py-2 font-body-sm text-body-sm text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
            </div>
            <span className="font-code-sm text-code-sm text-text-secondary">
              {filteredCharacters.length} / {characters.length} characters
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {filteredCharacters.map((character) => {
              const prompt = promptByCharacterId.get(character.characterId)
              const isRetrying = retryingCharacterId === character.characterId

              return (
                <div
                  key={character.id}
                  className="p-4 bg-surface-slate rounded border border-border-subtle hover:border-vilao-blue/50 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="bg-surface-dim border border-border-subtle text-vilao-blue font-code-sm text-code-sm px-2 py-0.5 rounded">
                      {character.characterId}
                    </span>
                    {character.role && (
                      <span className="bg-surface-dim border border-border-subtle text-text-secondary font-label-caps text-label-caps uppercase px-2 py-0.5 rounded">
                        {character.role}
                      </span>
                    )}
                    {(character.ageRange || character.gender) && (
                      <span className="font-body-sm text-body-sm text-text-secondary">
                        {[character.ageRange, character.gender].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>

                  <div className="mb-3">
                    <p className="font-label-caps text-label-caps text-text-secondary uppercase mb-1">Visual DNA</p>
                    <p className="font-body-md text-body-md text-text-primary">{character.visualDna}</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-label-caps text-label-caps text-text-secondary uppercase">Character Prompt</p>
                      {prompt?.status === 'success' && prompt.prompt && (
                        <button
                          type="button"
                          onClick={() => void onCopyPrompt(character.characterId, prompt.prompt!)}
                          className="flex items-center gap-1 font-body-sm text-body-sm text-text-secondary hover:text-vilao-blue transition-colors"
                        >
                          <Copy size={12} />
                          {copiedCharacterId === character.characterId ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </div>

                    {!prompt ? (
                      <p className="font-body-sm text-body-sm text-text-secondary italic">
                        Not generated yet — arrives after Run All generates Character Prompts.
                      </p>
                    ) : prompt.status === 'failed' ? (
                      <div className="flex items-start justify-between gap-3 bg-surface-dim border border-error/40 rounded p-3">
                        {prompt.error ? (
                          <ErrorNotice error={prompt.error} />
                        ) : (
                          <p className="font-body-sm text-body-sm text-error">Character Prompt Generation failed.</p>
                        )}
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => void onRetryPrompt(character.characterId)}
                          disabled={isRetrying || isProcessing}
                          title={isProcessing ? 'Available once the current run finishes or is paused.' : undefined}
                        >
                          <RotateCw size={12} className={isRetrying ? 'animate-spin' : undefined} />
                          {isRetrying ? 'Retrying…' : 'Retry'}
                        </Button>
                      </div>
                    ) : (
                      <p className="font-code-sm text-code-sm text-text-primary bg-[#020617] border border-border-subtle rounded p-3 whitespace-pre-wrap">
                        {prompt.prompt}
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
