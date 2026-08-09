import type { Character } from '@shared/entities'
import type { LlmChatMessage } from '../services/VilaoService'
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

const SRT_CONTEXT_PLACEHOLDER = '{{SRT_WITH_NEIGHBOR_CONTEXT}}'
const CHARACTER_INDEX_PLACEHOLDER = '{{COMPACT_CHARACTER_INDEX}}'

// spec.md 31 — Internal Relevant Character Selector. Not a user-editable
// prompt (spec.md: "không cần hiển thị trong Prompt Settings V1") so it lives
// only here, not in src/shared/prompts.ts alongside the 3 editable defaults.
const INTERNAL_SELECTOR_PROMPT = `Dựa trên SRT và Character Index, chọn các Character ID có khả năng xuất hiện hoặc được nhắc đến trong cảnh.

SRT:
${SRT_CONTEXT_PLACEHOLDER}

CHARACTER INDEX:
${CHARACTER_INDEX_PLACEHOLDER}

Chỉ trả về JSON:
{"character_ids":["@ID_1","@ID_2"]}`

export function buildRelevantCharacterSelectorMessages(
  srtWithNeighborContext: string,
  compactCharacterIndex: string
): LlmChatMessage[] {
  const content = INTERNAL_SELECTOR_PROMPT.split(SRT_CONTEXT_PLACEHOLDER)
    .join(srtWithNeighborContext)
    .split(CHARACTER_INDEX_PLACEHOLDER)
    .join(compactCharacterIndex)
  return [{ role: 'user', content }]
}

// Parses + validates the selector's response. Throws (never returns partial
// data) only when the JSON itself can't be parsed even after repair — the
// caller treats that as one failed attempt and retries. Unknown/invalid
// Character IDs inside an otherwise-valid response are silently dropped
// rather than failing the whole attempt: this is internal system logic
// (spec.md 31), not something surfaced to the user, so being lenient about
// stray IDs is safer than discarding an otherwise-good selection.
export function parseRelevantCharacterSelectorResponse(content: string, validCharacterIds: string[]): string[] {
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
    !Array.isArray((parsed as { character_ids?: unknown }).character_ids)
  ) {
    throw new Error('Relevant Character Selector response is missing a "character_ids" array')
  }

  const valid = new Set(validCharacterIds)
  const ids = (parsed as { character_ids: unknown[] }).character_ids.filter(
    (id): id is string => typeof id === 'string' && valid.has(id)
  )
  return Array.from(new Set(ids))
}
