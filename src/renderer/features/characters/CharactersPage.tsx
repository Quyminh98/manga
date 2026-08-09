import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, RefreshCw, RotateCw, Search, Sparkles, Users, Wand2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ErrorNotice } from '@renderer/components/ui/ErrorNotice'
import { Modal } from '@renderer/components/ui/Modal'
import { appApi } from '@renderer/lib/appApi'
import { formatErrorForDisplay } from '@renderer/lib/errorDisplay'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { getMissingPlaceholders } from '@shared/prompts'
import type { Character, CharacterPrompt } from '@shared/entities'

// spec.md 20 — Regenerate: after Character Detection has already run once,
// re-running it replaces the whole Character Database, which can leave
// existing Image Prompts referencing characters that no longer exist/changed
// — confirm which of the 3 choices the user wants instead of just doing it.
interface RegenerateCharactersModalProps {
  hasImagePrompts: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: (clearScenePrompts: boolean) => void
}

function RegenerateCharactersModal({ hasImagePrompts, busy, onCancel, onConfirm }: RegenerateCharactersModalProps): JSX.Element {
  return (
    <Modal open onClose={onCancel} title="Regenerate Characters">
      <p className="font-body-md text-body-md text-text-secondary mb-4">
        This re-runs Character Detection and replaces the Character Database.
        {hasImagePrompts &&
          ' Existing Image Prompts were generated against the current characters and may no longer match afterward.'}
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="primary" type="button" onClick={() => onConfirm(false)} disabled={busy}>
          Regenerate characters only
        </Button>
        <Button variant="danger" type="button" onClick={() => onConfirm(true)} disabled={busy}>
          Regenerate characters + all Image Prompts
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Modal>
  )
}

// spec.md 8.4 — Character Database. "Detect Characters" and "Generate
// Character Prompts" are temporary manual triggers (same pattern as SrtPage's
// "Split SRT", plan.md Phase 5) standing in for Run All, which arrives in
// Phase 9. No Stitch screen exists for this page (generate_screen_from_text
// timed out twice in Phase 6, see plan.md) — built directly with Tailwind
// against DESIGN.md tokens, so the Character Prompt column added in Phase 7
// follows that same convention rather than Stitch's edit_screens.
export function CharactersPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const [characters, setCharacters] = useState<Character[] | null>(null)
  const [prompts, setPrompts] = useState<CharacterPrompt[] | null>(null)
  const [hasImagePrompts, setHasImagePrompts] = useState(false)
  const [search, setSearch] = useState('')
  const [isDetecting, setIsDetecting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false)
  const [retryingCharacterId, setRetryingCharacterId] = useState<string | null>(null)
  const [copiedCharacterId, setCopiedCharacterId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [promptsError, setPromptsError] = useState<string | null>(null)
  const [missingPlaceholders, setMissingPlaceholders] = useState<{
    characterDetection: string[]
    characterGeneration: string[]
  }>({ characterDetection: [], characterGeneration: [] })

  const refresh = useCallback(async (id: string) => {
    const [characterList, promptList, scenePromptList] = await Promise.all([
      appApi.characters.list(id),
      appApi.characters.listPrompts(id),
      appApi.scenePrompts.list(id)
    ])
    setCharacters(characterList)
    setPrompts(promptList)
    setHasImagePrompts(scenePromptList.length > 0)
  }, [])

  useEffect(() => {
    setCharacters(null)
    setPrompts(null)
    setHasImagePrompts(false)
    setSearch('')
    setError(null)
    setPromptsError(null)
    if (projectId) void refresh(projectId)
  }, [projectId, refresh])

  useEffect(() => {
    void (async () => {
      const settings = await appApi.settings.get()
      setMissingPlaceholders({
        characterDetection: getMissingPlaceholders('characterDetection', settings.promptSettings.characterDetection),
        characterGeneration: getMissingPlaceholders('characterGeneration', settings.promptSettings.characterGeneration)
      })
    })()
  }, [])

  const runDetect = async (options?: { clearScenePrompts?: boolean }): Promise<void> => {
    if (!projectId) return
    setError(null)
    setIsDetecting(true)
    try {
      const result = await appApi.characters.detect(projectId, options)
      setCharacters(result)
      // A fresh Character Database invalidates any prompts generated for the
      // old one — CharacterService.detect() now clears character_prompts
      // server-side too (Phase 12), so this just mirrors that locally.
      setPrompts([])
      if (options?.clearScenePrompts) setHasImagePrompts(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Character Detection failed.')
    } finally {
      setIsDetecting(false)
    }
  }

  // spec.md 20 — Regenerate: once characters already exist, re-running
  // Detect Characters is a destructive replace, so confirm which of the 3
  // choices the user wants instead of firing immediately. A first-ever
  // detect (nothing to lose yet) skips the dialog.
  const onDetectClick = (): void => {
    if (characters && characters.length > 0) {
      setShowRegenerateDialog(true)
      return
    }
    void runDetect()
  }

  const onConfirmRegenerate = (clearScenePrompts: boolean): void => {
    setShowRegenerateDialog(false)
    void runDetect({ clearScenePrompts })
  }

  const onGeneratePrompts = async (): Promise<void> => {
    if (!projectId) return
    setPromptsError(null)
    setIsGenerating(true)
    try {
      const result = await appApi.characters.generatePrompts(projectId)
      setPrompts(result)
    } catch (err) {
      setPromptsError(err instanceof Error ? err.message : 'Character Prompt Generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

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

  const hasTranscript = (currentProject?.transcript ?? '').trim().length > 0
  // spec.md 27 — a required placeholder missing from the prompt blocks Run
  // (this manual trigger stands in for it until Phase 9).
  const detectBlockedReason = !hasTranscript
    ? 'Add a transcript first'
    : missingPlaceholders.characterDetection.length > 0
      ? `Fix the Character Detection prompt in Settings > Prompts (missing ${missingPlaceholders.characterDetection.join(', ')})`
      : undefined

  const generateBlockedReason = !characters || characters.length === 0
    ? 'Detect characters first'
    : missingPlaceholders.characterGeneration.length > 0
      ? `Fix the Character Generation prompt in Settings > Prompts (missing ${missingPlaceholders.characterGeneration.join(', ')})`
      : undefined

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Characters</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            Character Database and reference prompts detected from the transcript.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => void onGeneratePrompts()}
            disabled={isGenerating || !!generateBlockedReason}
            title={generateBlockedReason}
          >
            <Wand2 size={14} />
            {isGenerating ? 'Generating…' : 'Generate Character Prompts'}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={onDetectClick}
            disabled={isDetecting || !!detectBlockedReason}
            title={detectBlockedReason}
          >
            {characters && characters.length > 0 ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            {isDetecting ? 'Detecting…' : characters && characters.length > 0 ? 'Regenerate' : 'Detect Characters'}
          </Button>
        </div>
      </div>

      {showRegenerateDialog && (
        <RegenerateCharactersModal
          hasImagePrompts={hasImagePrompts}
          busy={isDetecting}
          onCancel={() => setShowRegenerateDialog(false)}
          onConfirm={onConfirmRegenerate}
        />
      )}

      {detectBlockedReason && missingPlaceholders.characterDetection.length > 0 && (
        <p className="mb-2 flex items-center gap-1.5 font-body-sm text-body-sm text-error">
          <AlertTriangle size={14} />
          {detectBlockedReason}
        </p>
      )}
      {generateBlockedReason && missingPlaceholders.characterGeneration.length > 0 && (
        <p className="mb-2 flex items-center gap-1.5 font-body-sm text-body-sm text-error">
          <AlertTriangle size={14} />
          {generateBlockedReason}
        </p>
      )}
      {error && <p className="mb-4 font-body-sm text-body-sm text-error">{formatErrorForDisplay(error)}</p>}
      {promptsError && <p className="mb-4 font-body-sm text-body-sm text-error">{formatErrorForDisplay(promptsError)}</p>}

      {characters === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      ) : characters.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No characters detected yet"
          description="Detect Characters analyzes the transcript and builds this list automatically."
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
                        Not generated yet — click &quot;Generate Character Prompts&quot;.
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
                          disabled={isRetrying}
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
