import type { Character, SrtBlock } from '@shared/entities'
import type { LlmChatMessage } from '../services/VilaoService'
import { repairJsonText } from './jsonRepair'
import { LlmResponseFormatError } from './errors'

// spec.md 17/18 — Step 5: Scene Prompt Generation + Context Window Strategy.
// Pure functions only: batching SRT blocks, assembling the minimal per-batch
// context (N consecutive SRT + 1 neighbor on each side of the batch +
// relevant character data only — never the full transcript or full Character
// Database, spec.md 17), a character-length token estimate, priority-ordered
// trimming when that estimate is over budget (spec.md 18.4), prompt
// templating, and multi-prompt response parsing. Orchestration
// (local/LLM relevant-character selection per SRT, calling VilaoService with
// retries, persisting to `scene_prompts`) lives in ScenePromptService.

const BLOCK_NUMBER_PLACEHOLDER = '{{BLOCK_NUMBER}}'
const SRT_TEXT_PLACEHOLDER = '{{SRT_TEXT}}'
const RELEVANT_CHARACTERS_PLACEHOLDER = '{{RELEVANT_CHARACTERS}}'
const RELEVANT_CHARACTER_PROMPTS_PLACEHOLDER = '{{RELEVANT_CHARACTER_PROMPTS}}'

// spec.md 17 — "gộp nhiều SRT liên tiếp vào 1 request thay vì gọi riêng từng
// SRT" (added after V1 ran too slowly at 1 SRT/request). Not a DB/settings
// field — a fixed pipeline constant, same convention as
// CHARACTER_PROMPT_BATCH_SIZE. Lowered from 20 to 10 (2026-08-09, user
// request — a 20-block batch felt slow) to shorten how long each request
// takes and, as a side effect, shrink the largest possible per-batch retry
// cost if SceneFormatCollapseError's batch-shrinking fallback ever kicks in.
export const SCENE_PROMPT_BATCH_SIZE = 10

export function chunkSrtBlocks(blocks: SrtBlock[], batchSize = SCENE_PROMPT_BATCH_SIZE): SrtBlock[][] {
  const batches: SrtBlock[][] = []
  for (let i = 0; i < blocks.length; i += batchSize) {
    batches.push(blocks.slice(i, i + batchSize))
  }
  return batches
}

// spec.md 8.5/24 — "PROMPT 001", zero-padded to 3 digits.
export function formatBlockNumber(blockIndex: number): string {
  return String(blockIndex).padStart(3, '0')
}

// Human-readable listing for the {{BLOCK_NUMBER}} instruction line — a
// single number for a batch of 1 (used by retry), every block number
// comma-separated for a full batch. Originally this compressed a full batch
// to a "001–020" first–last range, but that reads to the model as "one
// range" rather than "20 individual blocks": observed live against a real
// Vilao model, a 20-block batch consistently collapsed into a single merged
// "PROMPT 001-020:" response instead of 20 separate "PROMPT <n>:" blocks,
// failing parseSceneGenerationResponse every retry (retries resend the same
// batch, so the same ambiguous range every time). Spelling out every number
// removes that ambiguity — the OUTPUT contract already lists "BLOCK <n>:"
// per SRT in {{SRT_TEXT}}, so this doesn't change spec.md 30's literal
// default prompt text, only what fills its existing {{BLOCK_NUMBER}} slot.
export function formatBlockNumberRange(batch: SrtBlock[]): string {
  return batch.map((block) => formatBlockNumber(block.blockIndex)).join(', ')
}

// spec.md 18.4 — "ước lượng theo độ dài ký tự" (estimate by character
// length): a plain character count stands in for a token count. No
// per-model context window is tracked yet — only one global model selection
// exists (AppSettings.selectedModel); per-project model snapshots don't
// arrive until Phase 9 (spec.md 32) — so this is a fixed conservative budget
// rather than something derived from the selected model. SCENE_CONTEXT_CHAR_BUDGET
// is the baseline for a single-SRT request (used as-is by retry's batch of
// 1); PER_ADDITIONAL_BLOCK_BUDGET scales it up for larger batches.
export const SCENE_CONTEXT_CHAR_BUDGET = 6000
const PER_ADDITIONAL_BLOCK_BUDGET = 400

function budgetFor(batchSize: number): number {
  return SCENE_CONTEXT_CHAR_BUDGET + Math.max(0, batchSize - 1) * PER_ADDITIONAL_BLOCK_BUDGET
}

function estimateSize(text: string): number {
  return text.length
}

export interface SceneBatchNeighbors {
  // The single SRT block immediately before/after the batch (not part of the
  // batch itself) — spec.md 17: batches replace the old per-SRT
  // previous/next repetition with a single neighbor on each side of the
  // whole batch, since SRTs within the same batch already provide context
  // for each other.
  previous: SrtBlock | null
  batch: SrtBlock[]
  next: SrtBlock | null
}

// Builds the "Previous SRT / BLOCK <n>: .../ Next SRT" block that fills
// {{SRT_TEXT}}. spec.md 30's default prompt has no separate placeholder for
// neighbor context, so it's inlined here.
export function buildBatchSrtText(neighbors: SceneBatchNeighbors, includePrevious = true, includeNext = true): string {
  const sections: string[] = []
  if (includePrevious && neighbors.previous) sections.push(`Previous SRT: ${neighbors.previous.text}`)
  for (const block of neighbors.batch) {
    sections.push(`BLOCK ${formatBlockNumber(block.blockIndex)}:\n${block.text}`)
  }
  if (includeNext && neighbors.next) sections.push(`Next SRT: ${neighbors.next.text}`)
  return sections.join('\n\n')
}

// Single-SRT neighbor window (1 previous + current + 1 next, spec.md 16.3) —
// used only to build the internal Relevant Character Selector's
// {{SRT_WITH_NEIGHBOR_CONTEXT}} (spec.md 31) for one specific SRT at a time.
// Relevance is still resolved per-SRT even though the main Scene Generation
// call itself is batched (SceneBatchNeighbors above) — a scene's relevant
// characters genuinely differ block to block.
export interface SceneNeighborContext {
  previous: SrtBlock | null
  current: SrtBlock
  next: SrtBlock | null
}

export function buildNeighborSrtText(neighbors: SceneNeighborContext, includePrevious = true, includeNext = true): string {
  const lines: string[] = []
  if (includePrevious && neighbors.previous) lines.push(`Previous SRT: ${neighbors.previous.text}`)
  lines.push(`Current SRT: ${neighbors.current.text}`)
  if (includeNext && neighbors.next) lines.push(`Next SRT: ${neighbors.next.text}`)
  return lines.join('\n')
}

// spec.md 16.2 — "sau đó chỉ inject data đầy đủ của những Character ID đó" —
// full Visual DNA (not the compact index's truncated slice) for the union of
// characters relevant to any SRT in the batch. spec.md 18.4 priority #2,
// never dropped once a character has been selected as relevant.
export function buildRelevantCharactersSection(characters: Character[]): string {
  if (characters.length === 0) return '(none)'
  return characters.map((c) => `${c.characterId} | ${c.role || 'unspecified role'} | ${c.visualDna}`).join('\n')
}

// The generated English reference prompt (character_prompts.prompt) per
// relevant character — spec.md 18.4 priority #4, the first thing trimmed
// when the estimated context is over budget. Characters without a
// successfully generated prompt yet are omitted rather than shown blank.
export function buildRelevantCharacterPromptsSection(characters: Character[], promptByCharacterId: Map<string, string>): string {
  const withPrompts = characters.filter((c) => promptByCharacterId.has(c.characterId))
  if (withPrompts.length === 0) return '(none)'
  return withPrompts.map((c) => `${c.characterId}: ${promptByCharacterId.get(c.characterId)}`).join('\n\n')
}

export interface SceneContextInput {
  neighbors: SceneBatchNeighbors
  relevantCharactersSection: string
  // null => Relevant Character Reference is omitted from the start (spec.md
  // 31's total-selector-failure fallback: "không inject full Character
  // Reference cho tất cả nhân vật") rather than something trimmable away.
  relevantCharacterPromptsSection: string | null
  // Estimated size of everything else in the request (the prompt template's
  // fixed instructional text) — included in the budget check even though
  // it's never itself trimmed (spec.md 18.4 priority #3).
  fixedOverheadEstimate: number
}

export interface SceneContextResult {
  srtText: string
  relevantCharacters: string
  relevantCharacterPrompts: string
}

// spec.md 18.4 — assembles the context, then trims optional pieces in
// priority order (lowest priority dropped first) while the estimated total
// stays over budget (scaled to batch size, see budgetFor): drop Next SRT,
// then Previous SRT, then the Relevant Character Reference prompts. Every
// SRT block's own text (all of them "current" within the batch) and relevant
// characters' Visual DNA (priority #1/#2) are never dropped.
//
// `minTrimLevel` (spec.md 35 — Scene Generation's Context Too Large
// fallback: "1. bỏ Next SRT, 2. bỏ Previous SRT, 3/4. rút gọn Character
// Reference xuống chỉ còn Visual DNA") forces at least that many trim steps
// regardless of the character-count budget estimate — used reactively by
// ScenePromptService.generateBatch when the API itself reports the context
// was too large despite the proactive estimate saying it should fit
// (0 = estimate-only, the default; 1 = force-drop Next; 2 = force-drop
// Next+Previous; 3 = force-drop Next+Previous+Character Reference prompts,
// leaving only each block's SRT text and the relevant characters' Visual
// DNA — the floor spec.md 35 says must never be dropped).
export function assembleSceneContext(input: SceneContextInput, minTrimLevel: 0 | 1 | 2 | 3 = 0): SceneContextResult {
  let includePrevious = minTrimLevel < 2
  let includeNext = minTrimLevel < 1

  // Distinguish *why* the reference prompts are missing: started out that
  // way (spec.md 31 fallback) vs. trimmed away to fit the budget below —
  // each gets its own message so a batch without any relevant characters
  // doesn't look like a budget failure.
  const startedWithPrompts = input.relevantCharacterPromptsSection !== null
  let includePrompts = startedWithPrompts && minTrimLevel < 3

  const build = (): SceneContextResult => {
    const relevantCharacterPrompts = !startedWithPrompts
      ? '(omitted — character selection unavailable)'
      : includePrompts
        ? (input.relevantCharacterPromptsSection as string)
        : '(omitted to fit context budget)'
    return {
      srtText: buildBatchSrtText(input.neighbors, includePrevious, includeNext),
      relevantCharacters: input.relevantCharactersSection,
      relevantCharacterPrompts
    }
  }

  const budget = budgetFor(input.neighbors.batch.length)
  const totalEstimate = (result: SceneContextResult): number =>
    input.fixedOverheadEstimate +
    estimateSize(result.srtText) +
    estimateSize(result.relevantCharacters) +
    estimateSize(result.relevantCharacterPrompts)

  let result = build()
  if (totalEstimate(result) <= budget) return result

  includeNext = false
  result = build()
  if (totalEstimate(result) <= budget) return result

  includePrevious = false
  result = build()
  if (totalEstimate(result) <= budget) return result

  if (includePrompts) {
    includePrompts = false
    result = build()
  }
  return result
}

// Single self-contained instruction message, same convention as the other
// pipeline steps — spec.md 30's default prompt inlines all 4 placeholders
// into one instruction block. `blockNumberRange` fills {{BLOCK_NUMBER}} —
// use formatBlockNumberRange(batch) to build it.
export function buildSceneGenerationMessages(
  promptTemplate: string,
  blockNumberRange: string,
  context: SceneContextResult
): LlmChatMessage[] {
  const content = promptTemplate
    .split(BLOCK_NUMBER_PLACEHOLDER)
    .join(blockNumberRange)
    .split(SRT_TEXT_PLACEHOLDER)
    .join(context.srtText)
    .split(RELEVANT_CHARACTERS_PLACEHOLDER)
    .join(context.relevantCharacters)
    .split(RELEVANT_CHARACTER_PROMPTS_PLACEHOLDER)
    .join(context.relevantCharacterPrompts)
  return [{ role: 'user', content }]
}

// Thrown whenever the response doesn't round-trip into a valid
// { scene_prompts: [{ block_number, prompt }] } array with exactly one entry
// per requested block — observed live against a real Vilao model in the
// prior plain-text format ("PROMPT <n>:"), in two shapes: (a) everything
// merged into one header ("PROMPT 001-020:" for the whole batch, or a
// refusal/off-format reply) and (b) the model trailing off partway through
// the batch (e.g. wrote blocks 011-015 then stopped, leaving 016-020
// missing). Both reproduced identically on a bare retry of the same batch
// (observed 3/3 times each), which is why generate Batch shrinks the batch
// instead of just retrying it — see that function's comment. JSON output
// (this file, 2026-08-09) is a stronger structural contract than free-text
// markers and should make both shapes less frequent, but the model can still
// return malformed/incomplete JSON, so the same distinct error class (rather
// than a plain Error) still drives the same batch-shrinking recovery.
export class SceneFormatCollapseError extends LlmResponseFormatError {}

// spec.md 30's OUTPUT contract: { "scene_prompts": [{ "block_number": 1,
// "prompt": "..." }] } — one object per requested block. snake_case,
// matching the vocabulary parseCharacterGenerationResponse's
// "character_prompts" array already uses for the same kind of response.

// Parses + validates the LLM's (possibly multi-block) Scene Generation
// response — same JSON + repairJsonText shape as
// parseCharacterDetectionResponse/parseCharacterGenerationResponse. Throws
// SceneFormatCollapseError (never returns partial data) if the JSON can't be
// parsed even after repair, an item references a block_number outside this
// batch, or any requested block is missing from the response — the caller
// (ScenePromptService.generateBatch) treats that as one failed attempt and,
// for a batch of >1, shrinks the batch instead of blindly retrying the same
// shape (see SceneFormatCollapseError's comment).
export function parseSceneGenerationResponse(content: string, blockIndexes: number[]): Map<number, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    try {
      parsed = JSON.parse(repairJsonText(content))
    } catch {
      // Include a preview of what the model actually returned — with no
      // valid JSON to anchor on, the generic message alone gives no way to
      // tell a refusal/off-format reply apart from a truncated/empty-looking
      // one (plan.md Phase 9 — this is diagnostic only, not full
      // request/response debug logging, which stays scoped to Phase 12).
      const preview = content.trim().slice(0, 300)
      throw new SceneFormatCollapseError(`Scene Generation response is not valid JSON. Model responded: "${preview}"`)
    }
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { scene_prompts?: unknown }).scene_prompts)) {
    throw new SceneFormatCollapseError('Scene Generation response is missing a "scene_prompts" array')
  }

  const rawItems = (parsed as { scene_prompts: unknown[] }).scene_prompts
  const expected = new Set(blockIndexes)
  const byBlockIndex = new Map<number, string>()

  rawItems.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new SceneFormatCollapseError(`Scene Generation response item ${index + 1} is not an object`)
    }
    const record = item as Record<string, unknown>

    const blockNumber = typeof record.block_number === 'number' ? record.block_number : Number(record.block_number)
    if (!Number.isFinite(blockNumber)) {
      throw new SceneFormatCollapseError(`Scene Generation response item ${index + 1} is missing a valid "block_number"`)
    }
    if (!expected.has(blockNumber)) {
      throw new SceneFormatCollapseError(`Scene Generation response contains an unexpected block_number ${blockNumber}`)
    }
    if (byBlockIndex.has(blockNumber)) {
      throw new SceneFormatCollapseError(`Scene Generation response contains a duplicate block_number ${formatBlockNumber(blockNumber)}`)
    }

    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
    if (!prompt) throw new SceneFormatCollapseError(`Scene ${formatBlockNumber(blockNumber)} is missing "prompt"`)
    byBlockIndex.set(blockNumber, prompt)
  })

  const missing = blockIndexes.filter((idx) => !byBlockIndex.has(idx))
  if (missing.length > 0) {
    throw new SceneFormatCollapseError(
      `Scene Generation response is missing prompt(s) for block(s): ${missing.map(formatBlockNumber).join(', ')}`
    )
  }

  return byBlockIndex
}
