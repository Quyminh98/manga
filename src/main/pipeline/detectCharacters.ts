import type { LlmChatMessage } from '../services/VilaoService'
import { repairJsonText } from './jsonRepair'
import { LlmResponseFormatError } from './errors'

// spec.md 14 — Step 2: Character Detection. Pure functions only (prompt
// templating + JSON parsing/validation), no Electron/DB/network — orchestration
// (calling VilaoService with retries, persisting to `characters`) lives in
// CharacterService so this stays unit-testable in isolation.

// Shape of one item in the LLM's `characters` JSON array (spec.md 28 OUTPUT).
// snake_case, matching the LLM's contract verbatim — mapped to the camelCase
// `Character` entity (which also splits `name` into `characterId`/`name`,
// see CharacterService) at the persistence boundary, not here.
export interface DetectedCharacter {
  name: string
  gender: string
  age_range: string
  appearance: string
  hair: string
  clothing: string
  personality: string
  role: string
  unique_features: string
  visual_dna: string
}

const TRANSCRIPT_PLACEHOLDER = '{{TRANSCRIPT}}'

// Single self-contained instruction message — spec.md 28's default prompt is
// one instruction block with {{TRANSCRIPT}} inlined, not a system+user split.
export function buildCharacterDetectionMessages(promptTemplate: string, transcript: string): LlmChatMessage[] {
  return [{ role: 'user', content: promptTemplate.split(TRANSCRIPT_PLACEHOLDER).join(transcript) }]
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Parses + validates the LLM's Character Detection response. Throws a
// descriptive Error (never returns partial/invalid data) if the JSON can't be
// parsed even after repair, or doesn't match the expected shape — the caller
// treats that as one failed attempt and retries per project.maxRetry.
export function parseCharacterDetectionResponse(content: string): DetectedCharacter[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    try {
      parsed = JSON.parse(repairJsonText(content))
    } catch {
      throw new LlmResponseFormatError('Character Detection response is not valid JSON')
    }
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { characters?: unknown }).characters)) {
    throw new LlmResponseFormatError('Character Detection response is missing a "characters" array')
  }

  const rawCharacters = (parsed as { characters: unknown[] }).characters
  if (rawCharacters.length === 0) {
    throw new LlmResponseFormatError('Character Detection response contains no characters')
  }

  const seenNames = new Set<string>()

  return rawCharacters.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new LlmResponseFormatError(`Character Detection response item ${index + 1} is not an object`)
    }
    const record = item as Record<string, unknown>

    const name = asNonEmptyString(record.name)
    if (!name) throw new LlmResponseFormatError(`Character Detection response item ${index + 1} is missing "name"`)
    if (!name.startsWith('@')) {
      throw new LlmResponseFormatError(`Character Detection response item ${index + 1} has an invalid Character ID "${name}" (must start with @)`)
    }
    // characters.character_id is unique per project (schema.md) — a duplicate
    // in one response would fail the insert, so treat it as a bad attempt.
    if (seenNames.has(name)) throw new LlmResponseFormatError(`Character Detection response contains a duplicate Character ID "${name}"`)
    seenNames.add(name)

    const visualDna = asNonEmptyString(record.visual_dna)
    if (!visualDna) throw new LlmResponseFormatError(`Character "${name}" is missing "visual_dna"`)

    return {
      name,
      gender: asString(record.gender),
      age_range: asString(record.age_range),
      appearance: asString(record.appearance),
      hair: asString(record.hair),
      clothing: asString(record.clothing),
      personality: asString(record.personality),
      role: asString(record.role),
      unique_features: asString(record.unique_features),
      visual_dna: visualDna
    }
  })
}

// spec.md 35 — Character Detection's Context Too Large fallback: "chuyển
// sang chunking transcript". Splits on blank-line paragraph boundaries where
// possible (keeps a scene/paragraph whole), greedily packing paragraphs up
// to ~targetSize each — not grapheme/sentence-precise like
// splitSrt.ts's splitter (that one enforces a hard per-block character cap
// for SRT timing; this one just needs "small enough to fit a request", so
// staying simple and reusing splitSrt.ts's machinery isn't worth the
// coupling). `chunkCount` scales with transcript length so a merely-large
// transcript gets 2-3 chunks while a very long one gets proportionally more,
// each still under MAX_DETECTION_CHUNK_CHARS.
const MIN_DETECTION_CHUNKS = 2
const MAX_DETECTION_CHUNK_CHARS = 6000

// Falls back to sentence-ish boundaries for a single paragraph that's
// already bigger than a whole chunk on its own (e.g. a transcript with no
// blank lines at all) — otherwise chunking would have nothing to split on.
function splitOversizedUnit(unit: string, maxSize: number): string[] {
  if (unit.length <= maxSize) return [unit]
  const sentences = unit.match(/[^.?!]+[.?!]+(\s+|$)|[^.?!]+$/g) ?? [unit]
  const pieces: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const candidate = current + sentence
    if (current && candidate.length > maxSize) {
      pieces.push(current.trim())
      current = sentence
    } else {
      current = candidate
    }
  }
  if (current.trim()) pieces.push(current.trim())
  return pieces.length > 0 ? pieces : [unit]
}

export function chunkTranscriptForDetection(transcript: string): string[] {
  const trimmed = transcript.trim()
  if (!trimmed) return [trimmed]

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const units = (paragraphs.length > 0 ? paragraphs : [trimmed]).flatMap((p) => splitOversizedUnit(p, MAX_DETECTION_CHUNK_CHARS))

  const chunkCount = Math.max(MIN_DETECTION_CHUNKS, Math.ceil(trimmed.length / MAX_DETECTION_CHUNK_CHARS))
  const targetSize = Math.ceil(trimmed.length / chunkCount)

  const chunks: string[] = []
  let current = ''
  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit
    if (current && candidate.length > targetSize) {
      chunks.push(current)
      current = unit
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)

  return chunks.length > 0 ? chunks : [trimmed]
}

// spec.md 35 — "merge character results": deduplicates by Character ID
// ("@Name", the model's business key across the whole pipeline — spec.md 28)
// across every chunk's detection results. First chunk to introduce a name
// wins on a collision, which also happens to mean "earliest appearance in
// the transcript" since chunks are processed in order.
export function mergeDetectedCharacters(chunkResults: DetectedCharacter[][]): DetectedCharacter[] {
  const byName = new Map<string, DetectedCharacter>()
  for (const chunk of chunkResults) {
    for (const character of chunk) {
      if (!byName.has(character.name)) byName.set(character.name, character)
    }
  }
  return [...byName.values()]
}
