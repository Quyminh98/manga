import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { Character, CharacterPrompt, Project } from '@shared/entities'
import { ErrorCode, TaskStatus, TaskType } from '@shared/enums'
import { formatStoredError } from '@shared/errorCode'
import { getMissingPlaceholders } from '@shared/prompts'
import { findProjectById } from '../db/queries/projects.queries'
import {
  deleteCharactersByProjectId,
  findCharacterByProjectAndCharacterId,
  insertCharacters,
  listCharactersByProjectId
} from '../db/queries/characters.queries'
import {
  deleteCharacterPromptsByProjectId,
  listCharacterPromptsByProjectId,
  upsertCharacterPrompt
} from '../db/queries/characterPrompts.queries'
import { rateLimitDelayMs, sleep } from '../pipeline/backoff'
import { runWithConcurrency } from '../pipeline/concurrency'
import { classifyError } from '../pipeline/errorClassification'
import {
  buildCharacterDetectionMessages,
  chunkTranscriptForDetection,
  mergeDetectedCharacters,
  parseCharacterDetectionResponse,
  type DetectedCharacter
} from '../pipeline/detectCharacters'
import {
  buildCharacterGenerationMessages,
  chunkCharacters,
  parseCharacterGenerationResponse
} from '../pipeline/generateCharacterPrompts'
import type { LlmClient } from '../llm/LlmClient'

export interface DetectCharactersParams {
  llmClient: LlmClient
  promptTemplate: string
  // `projects.selected_model` isn't written anywhere yet — the app only has
  // one global model selection (Settings > Vilao API / AppSettings.selectedModel)
  // until Phase 9 sets `selected_model_snapshot` on first Run (spec.md 32). The
  // IPC layer resolves that global selection and passes it in explicitly, so
  // this service doesn't need to know about AppSettings at all.
  model: string
}

export interface GenerateCharacterPromptsParams {
  llmClient: LlmClient
  promptTemplate: string
  model: string
}

// No electron import — same convention as ProjectService/SrtService, unit
// testable via createDatabase(':memory:') and a fake LlmClient (only
// .chat() needs to be implemented).
export class CharacterService {
  constructor(private readonly db: Database.Database) {}

  list(projectId: string): Character[] {
    return listCharactersByProjectId(this.db, projectId)
  }

  // spec.md 14 — Character Detection: exactly one LLM call over the whole
  // transcript per attempt, parse + validate the JSON, retry up to
  // project.maxRetry on failure (spec.md 19.1's default 3 attempts applies
  // here too even though pipeline_tasks isn't wired for this step yet — same
  // deferral as SPLIT_SRT in Phase 5, see plan.md Phase 6 notes). Re-running
  // (also spec.md 20 — Regenerate) replaces the project's existing characters
  // *and* character_prompts wholesale, matching SrtService.split()'s
  // replace-not-diff behavior — character_prompts has no FK to characters
  // (business-key relation), so it has to be cleared explicitly or a
  // regenerate that renames/drops a Character ID would leave an orphaned row
  // behind forever (Phase 12 fix — plan.md).
  async detect(projectId: string, params: DetectCharactersParams): Promise<Character[]> {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!project.transcript.trim()) throw new Error('Add a transcript before running Character Detection.')

    const missing = getMissingPlaceholders('characterDetection', params.promptTemplate)
    if (missing.length > 0) {
      throw new Error(
        `Character Detection prompt is missing required placeholder(s): ${missing.join(', ')}. Fix it in Settings > Prompts.`
      )
    }

    let lastError: unknown
    let rateLimitStreak = 0
    for (let attempt = 1; attempt <= project.maxRetry; attempt++) {
      try {
        const detected = await this.detectOnce(projectId, params, project.transcript)
        const characters = this.toCharacters(projectId, detected)
        this.persistCharacters(projectId, characters)
        return characters
      } catch (err) {
        lastError = err
        const { code } = classifyError(err)

        // spec.md 35 — Character Detection Context Too Large fallback:
        // switch to chunked detection for the rest of this call instead of
        // blindly resending the same too-large request on the remaining
        // attempts.
        if (code === ErrorCode.CONTEXT_TOO_LARGE) {
          try {
            return await this.detectByChunks(projectId, project, params)
          } catch (chunkErr) {
            lastError = chunkErr
          }
          break
        }

        if (code === ErrorCode.RATE_LIMIT) {
          rateLimitStreak += 1
          await sleep(rateLimitDelayMs(rateLimitStreak))
        } else {
          rateLimitStreak = 0
        }
      }
    }

    const { code, message } = classifyError(lastError)
    throw new Error(formatStoredError(code, `Character Detection failed after ${project.maxRetry} attempt(s): ${message}`))
  }

  private async detectOnce(projectId: string, params: DetectCharactersParams, transcript: string): Promise<DetectedCharacter[]> {
    const messages = buildCharacterDetectionMessages(params.promptTemplate, transcript)
    const response = await params.llmClient.chat({
      model: params.model,
      messages,
      meta: { projectId, step: TaskType.DETECT_CHARACTERS },
      jsonMode: true
    })
    return parseCharacterDetectionResponse(response.content)
  }

  private toCharacters(projectId: string, detected: DetectedCharacter[]): Character[] {
    const now = new Date().toISOString()
    return detected.map((c) => ({
      id: randomUUID(),
      projectId,
      // The LLM's output only has one "@Name" field (spec.md 28 OUTPUT) — it
      // doubles as both the business key (characters.character_id) and the
      // display name (characters.name); there is no separate human-readable
      // name in the model's contract.
      characterId: c.name,
      name: c.name,
      gender: c.gender,
      ageRange: c.age_range,
      appearance: c.appearance,
      hair: c.hair,
      clothing: c.clothing,
      personality: c.personality,
      role: c.role,
      uniqueFeatures: c.unique_features,
      visualDna: c.visual_dna,
      createdAt: now,
      updatedAt: now
    }))
  }

  private persistCharacters(projectId: string, characters: Character[]): void {
    const replace = this.db.transaction(() => {
      deleteCharactersByProjectId(this.db, projectId)
      deleteCharacterPromptsByProjectId(this.db, projectId)
      insertCharacters(this.db, characters)
    })
    replace()
  }

  // spec.md 35 — Character Detection Context Too Large fallback: "1. Chuyển
  // sang chunking transcript. 2. Detect theo chunk. 3. Merge character
  // results." Each chunk gets its own fresh project.maxRetry budget; if any
  // chunk still can't be detected after exhausting it, the whole chunked
  // attempt fails (nothing partial is persisted, same all-or-nothing
  // contract as the single-request path).
  private async detectByChunks(projectId: string, project: Project, params: DetectCharactersParams): Promise<Character[]> {
    const chunks = chunkTranscriptForDetection(project.transcript)
    const perChunkResults: DetectedCharacter[][] = []

    for (const chunk of chunks) {
      let chunkLastError: unknown
      let succeeded = false
      for (let attempt = 1; attempt <= project.maxRetry; attempt++) {
        try {
          perChunkResults.push(await this.detectOnce(projectId, params, chunk))
          succeeded = true
          break
        } catch (err) {
          chunkLastError = err
        }
      }
      if (!succeeded) throw chunkLastError instanceof Error ? chunkLastError : new Error('Unknown error')
    }

    const characters = this.toCharacters(projectId, mergeDetectedCharacters(perChunkResults))
    this.persistCharacters(projectId, characters)
    return characters
  }

  listPrompts(projectId: string): CharacterPrompt[] {
    return listCharacterPromptsByProjectId(this.db, projectId)
  }

  // spec.md 15 — Character Prompt Generation: batches all characters
  // CHARACTER_PROMPT_BATCH_SIZE at a time (default 10/request), exactly one
  // English reference prompt per Character ID. Each batch retries up to
  // project.maxRetry independently of the others — a batch that keeps
  // failing marks every character in it `failed` without blocking the
  // remaining batches, so the UI's per-character Retry button (retryPrompt
  // below) can recover just the ones that didn't make it without touching
  // anyone else (plan.md Phase 7 test #4).
  async generatePrompts(projectId: string, params: GenerateCharacterPromptsParams): Promise<CharacterPrompt[]> {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const characters = listCharactersByProjectId(this.db, projectId)
    if (characters.length === 0) {
      throw new Error('Detect characters before generating Character Prompts.')
    }

    const missing = getMissingPlaceholders('characterGeneration', params.promptTemplate)
    if (missing.length > 0) {
      throw new Error(
        `Character Generation prompt is missing required placeholder(s): ${missing.join(', ')}. Fix it in Settings > Prompts.`
      )
    }

    // Snapshot prior results so a batch that fails on a re-run doesn't wipe
    // out a prompt that already succeeded on an earlier run.
    const existingPrompts = new Map(this.listPrompts(projectId).map((p) => [p.characterId, p.prompt]))

    // Phase 28 — batches are independent (each writes only its own characters),
    // so they run in parallel, as many at once as Scene Generation
    // (project.sceneConcurrency) rather than one after another.
    await runWithConcurrency(chunkCharacters(characters), project.sceneConcurrency, (batch) =>
      this.runGenerationBatch(projectId, batch, params, project.maxRetry, existingPrompts)
    )

    return this.listPrompts(projectId)
  }

  // Regenerates exactly one character's prompt (a batch of one) — the
  // independent "Retry" action on a single failed card.
  async retryPrompt(projectId: string, characterId: string, params: GenerateCharacterPromptsParams): Promise<CharacterPrompt> {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const character = findCharacterByProjectAndCharacterId(this.db, projectId, characterId)
    if (!character) throw new Error(`Character not found: ${characterId}`)

    const missing = getMissingPlaceholders('characterGeneration', params.promptTemplate)
    if (missing.length > 0) {
      throw new Error(
        `Character Generation prompt is missing required placeholder(s): ${missing.join(', ')}. Fix it in Settings > Prompts.`
      )
    }

    const existingPrompts = new Map(this.listPrompts(projectId).map((p) => [p.characterId, p.prompt]))
    await this.runGenerationBatch(projectId, [character], params, project.maxRetry, existingPrompts)

    const updated = this.listPrompts(projectId).find((p) => p.characterId === characterId)
    if (!updated) throw new Error(`Character Prompt not found after retry: ${characterId}`)
    return updated
  }

  private async runGenerationBatch(
    projectId: string,
    batch: Character[],
    params: GenerateCharacterPromptsParams,
    maxRetry: number,
    existingPrompts: Map<string, string | null>
  ): Promise<void> {
    let lastError: unknown
    let contextTooLarge = false
    let rateLimitStreak = 0
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const messages = buildCharacterGenerationMessages(params.promptTemplate, batch)
        const response = await params.llmClient.chat({
          model: params.model,
          messages,
          meta: { projectId, step: TaskType.GENERATE_CHARACTER_PROMPTS },
          jsonMode: true
        })
        const results = parseCharacterGenerationResponse(
          response.content,
          batch.map((c) => c.characterId)
        )

        const now = new Date().toISOString()
        const persist = this.db.transaction(() => {
          for (const result of results) {
            upsertCharacterPrompt(this.db, {
              id: randomUUID(),
              projectId,
              characterId: result.characterId,
              prompt: result.prompt,
              status: TaskStatus.SUCCESS,
              attempts: attempt,
              error: null,
              updatedAt: now
            })
          }
        })
        persist()
        return
      } catch (err) {
        lastError = err
        const { code } = classifyError(err)

        // spec.md 35 — Character Generation Context Too Large fallback:
        // "1. Giảm batch size. 2. Retry." Halves the batch and retries each
        // half independently (its own fresh maxRetry budget), same
        // shrink-and-recurse pattern as ScenePromptService's
        // SceneFormatCollapseError handling — repeats until batch size 1,
        // which has nothing left to shrink.
        if (batch.length > 1 && code === ErrorCode.CONTEXT_TOO_LARGE) {
          contextTooLarge = true
          break
        }

        if (code === ErrorCode.RATE_LIMIT) {
          rateLimitStreak += 1
          await sleep(rateLimitDelayMs(rateLimitStreak))
        } else {
          rateLimitStreak = 0
        }
      }
    }

    if (contextTooLarge) {
      const mid = Math.ceil(batch.length / 2)
      await this.runGenerationBatch(projectId, batch.slice(0, mid), params, maxRetry, existingPrompts)
      await this.runGenerationBatch(projectId, batch.slice(mid), params, maxRetry, existingPrompts)
      return
    }

    const { code, message } = classifyError(lastError)
    const now = new Date().toISOString()
    const persist = this.db.transaction(() => {
      for (const character of batch) {
        upsertCharacterPrompt(this.db, {
          id: randomUUID(),
          projectId,
          characterId: character.characterId,
          prompt: existingPrompts.get(character.characterId) ?? null,
          status: TaskStatus.FAILED,
          attempts: maxRetry,
          error: formatStoredError(code, message),
          updatedAt: now
        })
      }
    })
    persist()
  }
}
