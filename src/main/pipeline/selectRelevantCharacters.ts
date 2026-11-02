import type { Character, SrtBlock } from '@shared/entities'
import type { LlmChatMessage } from '../llm/LlmClient'
import { repairJsonText } from './jsonRepair'

// spec.md 16 — Step 4: Relevant Character Selection. Pure functions only
// (compact index, local alias matching, internal selector prompt templating
// + JSON parsing), no Electron/DB/network — orchestration (local match first,
// fall back to the LLM selector, retry, and the total-failure fallback from
// spec.md 31) lives in ScenePromptService, same split as detectCharacters.ts.

const TRAIT_TRUNCATE_LENGTH = 80

function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength).trimEnd()}…`
}

// spec.md 16.1 — "@ID | role | short traits". Never the full Character
// Prompt (character_prompts.prompt) — only a short slice of Visual DNA, kept
// small on purpose so the index stays cheap to send on every scene that needs
// the LLM selector fallback.
export function buildCompactCharacterIndex(characters: Character[]): string {
  return characters
    .map((c) => `${c.characterId} | ${c.role || 'unspecified role'} | ${truncate(c.visualDna, TRAIT_TRUNCATE_LENGTH)}`)
    .join('\n')
}

// spec.md 16.2 step 1 — local exact-name/alias matching, tried before the LLM
// selector. There's no separate alias field in the schema (characters.name
// duplicates character_id as of Phase 6), so the alias is derived from the
// Character ID itself: "@Qin_Hong_Adult" -> "qin hong adult" and, dropping a
// trailing age/state qualifier segment, "qin hong". Either form matching the
// SRT text (case-insensitive substring) counts as a confident local match.
export function matchLocalRelevantCharacterIds(srtText: string, characters: Character[]): string[] {
  const haystack = srtText.toLowerCase()
  const matched: string[] = []

  for (const character of characters) {
    const tokens = character.characterId.replace(/^@/, '').split('_').filter(Boolean)
    if (tokens.length === 0) continue

    const full = tokens.join(' ').toLowerCase()
    const withoutLastToken = tokens.length > 1 ? tokens.slice(0, -1).join(' ').toLowerCase() : null

    if (haystack.includes(full) || (withoutLastToken && haystack.includes(withoutLastToken))) {
      matched.push(character.characterId)
    }
  }

  return matched
}

// 2026-08-10 — cost/latency fix: with hundreds of SRT blocks, most misses of
// matchLocalRelevantCharacterIds() aren't "no character present", they're a
// pronoun ("she", "anh ta", "cô ấy"...) referring to whoever was already
// named nearby — every one of those was previously falling through to a real
// LLM call. VI phrases matched as substrings (distinctive multi-word
// combos — low false-positive risk, same style as matchLocalRelevantCharacterIds
// above); EN pronouns matched as whole tokens only (short words like "it"/"her"
// would false-positive constantly as substrings, e.g. inside "with"/"there").
const PRONOUN_PHRASES_VI = ['cô ấy', 'anh ta', 'anh ấy', 'chị ấy', 'ông ấy', 'bà ấy', 'người đó']
const PRONOUN_WORDS_VI = new Set(['hắn', 'họ', 'gã', 'nó'])
const PRONOUN_WORDS_EN = new Set(['he', 'she', 'him', 'her', 'his', 'hers', 'they', 'them', 'their', 'it'])

export function containsPronounHint(text: string): boolean {
  const normalized = text.toLowerCase()
  if (PRONOUN_PHRASES_VI.some((phrase) => normalized.includes(phrase))) return true
  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return tokens.some((token) => PRONOUN_WORDS_VI.has(token) || PRONOUN_WORDS_EN.has(token))
}

// spec.md 16.2/16.3 — pre-pass over the *full, ordered* block list (pure, no
// LLM, run once before batching/concurrency starts): direct name matches
// (matchLocalRelevantCharacterIds) become the "last known" relevant
// character set; a later block with no direct match but a pronoun hint
// inherits that set instead of needing the LLM selector fallback. A block
// with neither a direct match nor a pronoun hint — or a pronoun hint but
// nothing named yet — still gets [] (unresolved, caller falls back to the
// LLM selector, unchanged). This only ever *adds* locally-resolved blocks;
// it never removes the selector fallback for a block neither condition
// covers, so worst case behavior is identical to before this pre-pass
// existed. Heuristic trade-off: a scene that silently changes subject with
// no new name or pronoun cue can inherit a stale character — acceptable
// because the blast radius is a wrong/extra Visual DNA line in one Scene
// Prompt's context, not a broken pipeline step.
export function resolveLocalRelevantCharacterIds(blocks: SrtBlock[], characters: Character[]): Map<number, string[]> {
  const result = new Map<number, string[]>()
  let lastKnown: string[] = []

  for (const block of blocks) {
    const direct = matchLocalRelevantCharacterIds(block.text, characters)
    if (direct.length > 0) {
      result.set(block.blockIndex, direct)
      lastKnown = direct
      continue
    }
    if (lastKnown.length > 0 && containsPronounHint(block.text)) {
      result.set(block.blockIndex, lastKnown)
      continue
    }
    result.set(block.blockIndex, [])
  }

  return result
}

const CHARACTER_INDEX_PLACEHOLDER = '{{COMPACT_CHARACTER_INDEX}}'
const BLOCKS_PLACEHOLDER = '{{BLOCKS}}'

// spec.md 31 — Internal Relevant Character Selector. Not a user-editable
// prompt (spec.md: "không cần hiển thị trong Prompt Settings V1") so it lives
// only here, not in src/shared/prompts.ts alongside the 3 editable defaults.
//
// 2026-08-10 — batched across every SRT in a scene-generation batch that
// still needs the selector (mirrors how Scene Generation itself is already
// batched, spec.md 17), instead of 1 request per block — same rationale,
// same "block_number keyed array" response shape as
// parseSceneGenerationResponse (generateScenePrompt.ts).
//
// Phase 28 — ordered fixed-first for prompt caching: instructions + output
// format + the Character Index (identical for every call in a project) form a
// stable prefix; only the BLOCKS at the end change between calls.
const INTERNAL_SELECTOR_PROMPT = `Dựa trên Character Index và các SRT block (ở cuối prompt), với MỖI block chọn các Character ID có khả năng xuất hiện hoặc được nhắc đến trong cảnh.

Chỉ trả về JSON, đúng 1 phần tử cho mỗi block:
{"relevant_characters":[{"block_number":1,"character_ids":["@ID_1","@ID_2"]}]}

CHARACTER INDEX:
${CHARACTER_INDEX_PLACEHOLDER}

BLOCKS:
${BLOCKS_PLACEHOLDER}`

export interface BatchSelectorItem {
  blockNumber: number
  srtWithNeighborContext: string
}

export function buildBatchRelevantCharacterSelectorMessages(
  items: BatchSelectorItem[],
  compactCharacterIndex: string
): LlmChatMessage[] {
  const blocksText = items.map((item) => `BLOCK ${item.blockNumber}:\n${item.srtWithNeighborContext}`).join('\n\n')
  const content = INTERNAL_SELECTOR_PROMPT.split(BLOCKS_PLACEHOLDER)
    .join(blocksText)
    .split(CHARACTER_INDEX_PLACEHOLDER)
    .join(compactCharacterIndex)
  return [{ role: 'user', content }]
}

// Parses + validates the batched selector's response. Lenient by design — a
// block missing from the response just gets an empty selection (the same
// outcome as the selector legitimately finding no relevant character for
// it), and unknown/invalid Character IDs or unexpected block_numbers inside
// an otherwise-valid response are silently dropped rather than failing the
// whole attempt (this is internal system logic, spec.md 31, not user-facing
// output). Throws (triggering a retry of the whole batch, same as before)
// only when the JSON itself can't be parsed even after repair, or the
// top-level shape is wrong.
export function parseBatchRelevantCharacterSelectorResponse(
  content: string,
  blockNumbers: number[],
  validCharacterIds: string[]
): Map<number, string[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    try {
      parsed = JSON.parse(repairJsonText(content))
    } catch {
      throw new Error('Relevant Character Selector response is not valid JSON')
    }
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { relevant_characters?: unknown }).relevant_characters)
  ) {
    throw new Error('Relevant Character Selector response is missing a "relevant_characters" array')
  }

  const validCharacters = new Set(validCharacterIds)
  const expectedBlocks = new Set(blockNumbers)
  const result = new Map<number, string[]>(blockNumbers.map((n) => [n, []]))

  const rawItems = (parsed as { relevant_characters: unknown[] }).relevant_characters
  for (const item of rawItems) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const blockNumber = typeof record.block_number === 'number' ? record.block_number : Number(record.block_number)
    if (!Number.isFinite(blockNumber) || !expectedBlocks.has(blockNumber)) continue
    if (!Array.isArray(record.character_ids)) continue

    const ids = record.character_ids.filter((id): id is string => typeof id === 'string' && validCharacters.has(id))
    const existing = result.get(blockNumber) ?? []
    result.set(blockNumber, Array.from(new Set([...existing, ...ids])))
  }

  return result
}
