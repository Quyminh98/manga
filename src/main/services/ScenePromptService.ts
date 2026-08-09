import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { Character, ScenePrompt, SrtBlock } from '@shared/entities'
import { ErrorCode, TaskStatus } from '@shared/enums'
import { formatStoredError } from '@shared/errorCode'
import { getMissingPlaceholders } from '@shared/prompts'
import type { ScenePromptGenerationProgress } from '@shared/ipc-types'
import { findProjectById } from '../db/queries/projects.queries'
import { listSrtBlocksByProjectId } from '../db/queries/srtBlocks.queries'
import { listCharactersByProjectId } from '../db/queries/characters.queries'
import { listCharacterPromptsByProjectId } from '../db/queries/characterPrompts.queries'
import { deleteScenePromptsByProjectId, listScenePromptsByProjectId, upsertScenePrompt } from '../db/queries/scenePrompts.queries'
import { rateLimitDelayMs, sleep } from '../pipeline/backoff'
import { classifyError } from '../pipeline/errorClassification'
import {
  buildCompactCharacterIndex,
  buildRelevantCharacterSelectorMessages,
  matchLocalRelevantCharacterIds,
  parseRelevantCharacterSelectorResponse
} from '../pipeline/selectRelevantCharacters'
import {
  assembleSceneContext,
  buildNeighborSrtText,
  buildRelevantCharacterPromptsSection,
  buildRelevantCharactersSection,
  buildSceneGenerationMessages,
  chunkSrtBlocks,
  formatBlockNumberRange,
  parseSceneGenerationResponse,
  SceneFormatCollapseError,
  type SceneBatchNeighbors,
  type SceneNeighborContext
} from '../pipeline/generateScenePrompt'
import type { VilaoService } from './VilaoService'

export interface GenerateScenePromptsParams {
  vilaoService: VilaoService
  promptTemplate: string
  // Same convention as CharacterService's params — the IPC layer resolves
  // AppSettings.selectedModel and passes it in explicitly; per-project model
  // snapshots don't exist until Phase 9 (spec.md 32).
  model: string
}

interface RelevantSelection {
  characterIds: string[]
  // spec.md 31 — set when the internal LLM selector exhausted every retry
  // attempt with no confident local match either, for this specific SRT.
  usedFallback: boolean
}

// spec.md 33 — "Rate limit → backoff cho Scene Generation concurrency": a
// single mutable object shared by every concurrent worker in one generate()
// call. When any worker hits RATE_LIMIT, it pushes `pauseUntil` forward;
// every worker (not just the one that got rate-limited) waits it out before
// its next attempt, so the whole concurrency pool actually slows down
// together instead of just the one unlucky request backing off on its own.
interface BackoffState {
  pauseUntil: number
}

// Bounded-concurrency task pool: `concurrency` workers each pull the next
// unstarted item (in order) and run `worker` on it, until every item has
// been processed. No third-party dependency — small enough to inline, and
// this is the only place in the app that currently needs it. Items may
// finish out of order relative to each other, but each worker always starts
// its items in array order.
// `shouldContinue` (optional) is polled before a worker picks up its next
// item — Pause/Cancel support (plan.md Phase 9): once it returns false, no
// new batch starts, but whatever a worker already started keeps running to
// completion ("request đang chạy được phép hoàn thành", spec.md 37).
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldContinue?: () => boolean
): Promise<void> {
  let cursor = 0
  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        if (shouldContinue && !shouldContinue()) return
        const index = cursor++
        await worker(items[index], index)
      }
    })
  )
}

// spec.md 17 — Step 5: Scene Prompt Generation. No electron import — same
// convention as CharacterService/SrtService, unit-testable via
// createDatabase(':memory:') and a fake VilaoService.
export class ScenePromptService {
  constructor(private readonly db: Database.Database) {}

  list(projectId: string): ScenePrompt[] {
    return listScenePromptsByProjectId(this.db, projectId)
  }

  // Generates exactly one Scene Prompt per SRT block (1:1, spec.md 17/schema.md
  // scene_prompts unique(project_id, srt_block_id)), batching
  // SCENE_PROMPT_BATCH_SIZE (default 10) consecutive blocks per LLM request
  // (spec.md 17 — added after V1 shipped too slowly at 1 SRT/request). Runs
  // up to project.sceneConcurrency (spec.md 33 — default 4, range 1-5;
  // per-project, configurable via Settings > Advanced > Pipeline Tuning,
  // `projects.scene_concurrency` column has been there since Phase 2)
  // batches at once instead of one at a time — batches are built
  // from non-overlapping SRT block ranges, so running several concurrently
  // never touches the same DB row from two batches at once. `onProgress`
  // (optional — unit tests don't need it) fires once per finished batch,
  // success or failed, so the IPC layer can push live progress to the
  // Renderer instead of it waiting for the whole call to resolve.
  // `shouldContinue` (optional, plan.md Phase 9 — Pause/Cancel) is checked
  // between batches; once false, no new batch starts. Batches whose every
  // block is already `success` (plan.md Phase 9 — Resume, spec.md 19.2/19.3:
  // "không chạy lại success task") are skipped without an LLM call — safe
  // because a batch only ever gets written after it fully succeeds or fully
  // exhausts retries (generateBatch's all-or-nothing persist), so "every
  // block already success" and "this batch has nothing left to do" are the
  // same condition. A batch that was only partially written (app killed
  // mid-attempt) has no rows yet, so it's picked up again in full.
  async generate(
    projectId: string,
    params: GenerateScenePromptsParams,
    onProgress?: (progress: ScenePromptGenerationProgress) => void,
    shouldContinue?: () => boolean
  ): Promise<ScenePrompt[]> {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const blocks = listSrtBlocksByProjectId(this.db, projectId)
    if (blocks.length === 0) {
      throw new Error('Split the transcript into SRT blocks before generating Image Prompts.')
    }

    const missing = getMissingPlaceholders('sceneGeneration', params.promptTemplate)
    if (missing.length > 0) {
      throw new Error(
        `Scene Generation prompt is missing required placeholder(s): ${missing.join(', ')}. Fix it in Settings > Prompts.`
      )
    }

    const characters = listCharactersByProjectId(this.db, projectId)
    const promptByCharacterId = this.buildPromptByCharacterId(projectId)
    const existingByBlockIndex = new Map(this.list(projectId).map((sp) => [sp.blockIndex, sp]))

    const batches = chunkSrtBlocks(blocks)
    const batchStarts = batches.map((_, i) => batches.slice(0, i).reduce((sum, b) => sum + b.length, 0))

    // Shared across every concurrent batch worker below (spec.md 33 — see
    // BackoffState's own comment).
    const backoffState: BackoffState = { pauseUntil: 0 }

    let completedBlocks = 0
    let batchesCompleted = 0
    await runWithConcurrency(
      batches,
      Math.max(1, project.sceneConcurrency),
      async (batch, i) => {
        const alreadyDone = batch.every((b) => existingByBlockIndex.get(b.blockIndex)?.status === TaskStatus.SUCCESS)
        if (!alreadyDone) {
          await this.generateBatch(
            projectId, project.maxRetry, blocks, batchStarts[i], batch.length, characters, promptByCharacterId, params, backoffState, shouldContinue
          )
        }
        completedBlocks += batch.length
        batchesCompleted += 1
        const batchBlockIndexes = new Set(batch.map((b) => b.blockIndex))
        onProgress?.({
          batchesCompleted,
          totalBatches: batches.length,
          completedBlocks,
          totalBlocks: blocks.length,
          batchResults: this.list(projectId).filter((sp) => batchBlockIndexes.has(sp.blockIndex))
        })
      },
      shouldContinue
    )

    return this.list(projectId)
  }

  // Regenerates exactly one SRT block's Scene Prompt (a batch of one) — the
  // independent "Retry" action on a single failed card, same pattern as
  // CharacterService.retryPrompt. Reuses generateBatch so a single retried
  // block goes through the exact same request/parse shape as a full batch.
  async retry(projectId: string, blockIndex: number, params: GenerateScenePromptsParams): Promise<ScenePrompt> {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const blocks = listSrtBlocksByProjectId(this.db, projectId)
    const index = blocks.findIndex((b) => b.blockIndex === blockIndex)
    if (index === -1) throw new Error(`SRT block not found: ${blockIndex}`)

    const missing = getMissingPlaceholders('sceneGeneration', params.promptTemplate)
    if (missing.length > 0) {
      throw new Error(
        `Scene Generation prompt is missing required placeholder(s): ${missing.join(', ')}. Fix it in Settings > Prompts.`
      )
    }

    const characters = listCharactersByProjectId(this.db, projectId)
    const promptByCharacterId = this.buildPromptByCharacterId(projectId)

    await this.generateBatch(projectId, project.maxRetry, blocks, index, 1, characters, promptByCharacterId, params, { pauseUntil: 0 })

    const updated = this.list(projectId).find((sp) => sp.blockIndex === blockIndex)
    if (!updated) throw new Error(`Scene Prompt not found after retry: ${blockIndex}`)
    return updated
  }

  // spec.md 20 — Regenerate "characters + all scene prompts": wipes every
  // Scene Prompt so none of them keep referencing the Character Database
  // that just got replaced (CharactersPage/projects.ipc.ts, Phase 12).
  clearAll(projectId: string): void {
    deleteScenePromptsByProjectId(this.db, projectId)
  }

  private buildPromptByCharacterId(projectId: string): Map<string, string> {
    const characterPrompts = listCharacterPromptsByProjectId(this.db, projectId)
    return new Map(
      characterPrompts.filter((p) => p.status === TaskStatus.SUCCESS && p.prompt).map((p) => [p.characterId, p.prompt as string])
    )
  }

  private async generateBatch(
    projectId: string,
    maxRetry: number,
    allBlocks: SrtBlock[],
    batchStart: number,
    batchLength: number,
    characters: Character[],
    promptByCharacterId: Map<string, string>,
    params: GenerateScenePromptsParams,
    backoffState: BackoffState,
    shouldContinue?: () => boolean
  ): Promise<void> {
    const batch = allBlocks.slice(batchStart, batchStart + batchLength)
    const neighbors: SceneBatchNeighbors = {
      previous: batchStart > 0 ? allBlocks[batchStart - 1] : null,
      batch,
      next: batchStart + batchLength < allBlocks.length ? allBlocks[batchStart + batchLength] : null
    }

    // Relevant-character selection stays per-SRT (relevance genuinely
    // differs block to block) — only the LLM generation call itself is
    // batched. Each block's own immediate siblings (not just the batch's
    // outer neighbors) are used for local matching/selector context, same
    // window as before batching existed.
    const selectionByBlockIndex = new Map<number, RelevantSelection>()
    for (let i = 0; i < batch.length; i++) {
      const globalIndex = batchStart + i
      const blockNeighbors: SceneNeighborContext = {
        previous: globalIndex > 0 ? allBlocks[globalIndex - 1] : null,
        current: batch[i],
        next: globalIndex < allBlocks.length - 1 ? allBlocks[globalIndex + 1] : null
      }
      selectionByBlockIndex.set(
        batch[i].blockIndex,
        await this.selectRelevantCharacters(blockNeighbors, characters, maxRetry, params, backoffState)
      )
    }

    const selections = [...selectionByBlockIndex.values()]
    const anyFallback = selections.some((s) => s.usedFallback)
    const unionCharacterIds = Array.from(new Set(selections.flatMap((s) => s.characterIds)))

    let relevantCharactersSection: string
    let relevantCharacterPromptsSection: string | null
    if (unionCharacterIds.length === 0 && anyFallback) {
      // spec.md 31 — nothing could be confidently resolved anywhere in this
      // batch: fall back to the compact index of every character instead of
      // full data for a specific (nonexistent) selection, and omit Character
      // Reference prompts entirely.
      relevantCharactersSection = buildCompactCharacterIndex(characters)
      relevantCharacterPromptsSection = null
    } else {
      const relevantCharacters = characters.filter((c) => unionCharacterIds.includes(c.characterId))
      relevantCharactersSection = buildRelevantCharactersSection(relevantCharacters)
      relevantCharacterPromptsSection = buildRelevantCharacterPromptsSection(relevantCharacters, promptByCharacterId)
    }

    const blockIndexes = batch.map((b) => b.blockIndex)
    const now = (): string => new Date().toISOString()
    const existingByBlockIndex = new Map(this.list(projectId).map((sp) => [sp.blockIndex, sp]))

    let lastError: unknown
    let formatCollapsed = false
    // spec.md 35 — Scene Generation Context Too Large fallback: escalates
    // through assembleSceneContext's priority order (0 = proactive
    // budget-estimate only, the default; 3 = force-drop Next SRT + Previous
    // SRT + Character Reference prompts, leaving only this batch's own SRT
    // text and the relevant characters' Visual DNA) whenever the API itself
    // reports the context was too large, regardless of what the proactive
    // character-count estimate predicted.
    let contextTrimLevel: 0 | 1 | 2 | 3 = 0
    let rateLimitStreak = 0
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      // Pause/Cancel (plan.md Phase 9): checked before every retry attempt,
      // not just between batches — a batch with maxRetry=3 real LLM calls
      // could otherwise run for minutes with a single batch (few enough SRT
      // blocks to fit in one), making Pause/Cancel look completely
      // unresponsive since there'd be no "between batches" checkpoint to
      // ever hit. Stopping here leaves this block's existing DB row (if any)
      // untouched instead of persisting a "failed" result — the interrupted
      // attempt wasn't a genuine exhaustion of maxRetry, so it shouldn't
      // read as one; the next Run/Resume retries this batch fresh.
      if (shouldContinue && !shouldContinue()) return

      // spec.md 33 — wait out any backoff another worker in this same
      // generate() call triggered (or this batch's own previous attempt).
      if (backoffState.pauseUntil > Date.now()) {
        await sleep(backoffState.pauseUntil - Date.now())
        if (shouldContinue && !shouldContinue()) return
      }

      const context = assembleSceneContext(
        { neighbors, relevantCharactersSection, relevantCharacterPromptsSection, fixedOverheadEstimate: params.promptTemplate.length },
        contextTrimLevel
      )
      try {
        const messages = buildSceneGenerationMessages(params.promptTemplate, formatBlockNumberRange(batch), context)
        const response = await params.vilaoService.chat({ model: params.model, messages })
        const promptsByBlockIndex = parseSceneGenerationResponse(response.content, blockIndexes)

        const persist = this.db.transaction(() => {
          for (const block of batch) {
            const existing = existingByBlockIndex.get(block.blockIndex)
            upsertScenePrompt(this.db, {
              id: existing?.id ?? randomUUID(),
              projectId,
              srtBlockId: block.id,
              blockIndex: block.blockIndex,
              relevantCharacterIds: selectionByBlockIndex.get(block.blockIndex)!.characterIds,
              prompt: promptsByBlockIndex.get(block.blockIndex)!,
              status: TaskStatus.SUCCESS,
              attempts: attempt,
              error: null,
              updatedAt: now()
            })
          }
        })
        persist()
        return
      } catch (err) {
        lastError = err
        // Observed live: a >1-block batch can make the model collapse every
        // block into one merged response instead of one marker each (see
        // SceneFormatCollapseError's own comment) — retrying the exact same
        // batch shape reliably reproduces the exact same failure (it did,
        // 3/3 times, against a real model). Stop burning retry attempts on
        // a shape that's already proven doomed and shrink instead, below.
        if (batch.length > 1 && err instanceof SceneFormatCollapseError) {
          formatCollapsed = true
          break
        }

        const { code } = classifyError(err)
        if (code === ErrorCode.CONTEXT_TOO_LARGE && contextTrimLevel < 3) {
          contextTrimLevel = (contextTrimLevel + 1) as 1 | 2 | 3
        }
        if (code === ErrorCode.RATE_LIMIT) {
          rateLimitStreak += 1
          backoffState.pauseUntil = Math.max(backoffState.pauseUntil, Date.now() + rateLimitDelayMs(rateLimitStreak))
        } else {
          rateLimitStreak = 0
        }
      }
    }

    if (formatCollapsed) {
      // Split this batch in half and generate each half independently
      // (recursing through this same method, so each half gets neighbor
      // context/relevant-character-selection/persistence exactly like any
      // other batch, plus its own fresh maxRetry budget) — repeats until
      // batch size 1, which has nothing else to merge with and so can't hit
      // this specific failure mode again. Sequential, not concurrent: this
      // is already running inside one of runWithConcurrency's workers, and
      // splitting is the rare/expensive fallback path, not the common case.
      const mid = Math.ceil(batch.length / 2)
      await this.generateBatch(
        projectId, maxRetry, allBlocks, batchStart, mid, characters, promptByCharacterId, params, backoffState, shouldContinue
      )
      await this.generateBatch(
        projectId, maxRetry, allBlocks, batchStart + mid, batch.length - mid, characters, promptByCharacterId, params, backoffState, shouldContinue
      )
      return
    }

    const { code, message } = classifyError(lastError)
    const persist = this.db.transaction(() => {
      for (const block of batch) {
        const existing = existingByBlockIndex.get(block.blockIndex)
        upsertScenePrompt(this.db, {
          id: existing?.id ?? randomUUID(),
          projectId,
          srtBlockId: block.id,
          blockIndex: block.blockIndex,
          relevantCharacterIds: selectionByBlockIndex.get(block.blockIndex)!.characterIds,
          // Preserve a previously successful prompt (if any) instead of
          // wiping it on a later failed regenerate — same data-preservation
          // decision as CharacterService.runGenerationBatch (Phase 7).
          prompt: existing?.prompt ?? null,
          status: TaskStatus.FAILED,
          attempts: maxRetry,
          error: formatStoredError(code, message),
          updatedAt: now()
        })
      }
    })
    persist()
  }

  // spec.md 16.2 — local exact-name/alias matching first; if that finds
  // nothing (not confident enough), a short internal LLM call selects
  // Character IDs instead (spec.md 31), retried up to maxRetry. If the
  // selector still fails after every attempt, falls back per spec.md 31.
  private async selectRelevantCharacters(
    neighbors: SceneNeighborContext,
    characters: Character[],
    maxRetry: number,
    params: GenerateScenePromptsParams,
    backoffState: BackoffState
  ): Promise<RelevantSelection> {
    if (characters.length === 0) return { characterIds: [], usedFallback: false }

    const localMatches = matchLocalRelevantCharacterIds(neighbors.current.text, characters)
    if (localMatches.length > 0) return { characterIds: localMatches, usedFallback: false }

    const compactIndex = buildCompactCharacterIndex(characters)
    const srtWithNeighborContext = buildNeighborSrtText(neighbors)
    const validIds = characters.map((c) => c.characterId)

    let rateLimitStreak = 0
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      if (backoffState.pauseUntil > Date.now()) {
        await sleep(backoffState.pauseUntil - Date.now())
      }
      try {
        const messages = buildRelevantCharacterSelectorMessages(srtWithNeighborContext, compactIndex)
        const response = await params.vilaoService.chat({ model: params.model, messages })
        const ids = parseRelevantCharacterSelectorResponse(response.content, validIds)
        return { characterIds: ids, usedFallback: false }
      } catch (err) {
        // spec.md 33 — same shared backoff pool as generateBatch's main
        // generation call; a rate limit here slows down the whole
        // concurrency pool too, not just this selector call.
        if (classifyError(err).code === ErrorCode.RATE_LIMIT) {
          rateLimitStreak += 1
          backoffState.pauseUntil = Math.max(backoffState.pauseUntil, Date.now() + rateLimitDelayMs(rateLimitStreak))
        } else {
          rateLimitStreak = 0
        }
      }
    }

    return { characterIds: [], usedFallback: true }
  }
}
