import type { Character } from '@shared/entities'
import type { LlmChatMessage } from '../services/VilaoService'
import { repairJsonText } from './jsonRepair'
import { LlmResponseFormatError } from './errors'

// spec.md 15 — Step 3: Character Prompt Generation. Pure functions only
// (batching, prompt templating, JSON parsing/validation), no Electron/DB/
// network — orchestration (calling VilaoService with retries, persisting to
// `character_prompts`) lives in CharacterService, same split as
// pipeline/detectCharacters.ts.

// spec.md 15's suggested default — "10 characters / request".
export const CHARACTER_PROMPT_BATCH_SIZE = 10

export function chunkCharacters(characters: Character[], batchSize = CHARACTER_PROMPT_BATCH_SIZE): Character[][] {
  const batches: Character[][] = []
  for (let i = 0; i < characters.length; i += batchSize) {
    batches.push(characters.slice(i, i + batchSize))
  }
  return batches
}

const CHARACTERS_PLACEHOLDER = '{{CHARACTERS}}'

// snake_case, matching the vocabulary the model already produced for these
// same fields in Character Detection (spec.md 28) — sent back as input data
// (spec.md 15: "Input: Character Database") so the model has everything it
// needs to preserve Visual DNA without guessing.
interface CharacterGenerationInput {
  character_id: string
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

function toGenerationInput(character: Character): CharacterGenerationInput {
  return {
    character_id: character.characterId,
    gender: character.gender,
    age_range: character.ageRange,
    appearance: character.appearance,
    hair: character.hair,
    clothing: character.clothing,
    personality: character.personality,
    role: character.role,
    unique_features: character.uniqueFeatures,
    visual_dna: character.visualDna
  }
}

// Single self-contained instruction message, same convention as
// buildCharacterDetectionMessages — spec.md 29's default prompt inlines
// {{CHARACTERS}} into one instruction block.
export function buildCharacterGenerationMessages(promptTemplate: string, characters: Character[]): LlmChatMessage[] {
  const charactersJson = JSON.stringify(characters.map(toGenerationInput), null, 2)
  return [{ role: 'user', content: promptTemplate.split(CHARACTERS_PLACEHOLDER).join(charactersJson) }]
}

export interface CharacterPromptResult {
  characterId: string
  prompt: string
}

// Parses + validates one batch's response against the Character IDs that
// were actually sent in that batch. Throws (never returns partial data) if
// the JSON can't be parsed even after repair, an item references a Character
// ID outside the batch, or any expected ID is missing from the output — the
// caller (CharacterService) treats that as one failed attempt for the whole
// batch and retries per project.maxRetry, same shape as
// parseCharacterDetectionResponse.
export function parseCharacterGenerationResponse(content: string, expectedCharacterIds: string[]): CharacterPromptResult[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    try {
      parsed = JSON.parse(repairJsonText(content))
    } catch {
      throw new LlmResponseFormatError('Character Generation response is not valid JSON')
    }
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { character_prompts?: unknown }).character_prompts)
  ) {
    throw new LlmResponseFormatError('Character Generation response is missing a "character_prompts" array')
  }

  const rawPrompts = (parsed as { character_prompts: unknown[] }).character_prompts
  const expected = new Set(expectedCharacterIds)
  const byId = new Map<string, string>()

  rawPrompts.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new LlmResponseFormatError(`Character Generation response item ${index + 1} is not an object`)
    }
    const record = item as Record<string, unknown>

    const characterId = typeof record.character_id === 'string' ? record.character_id.trim() : ''
    if (!characterId) throw new LlmResponseFormatError(`Character Generation response item ${index + 1} is missing "character_id"`)
    if (!expected.has(characterId)) {
      throw new LlmResponseFormatError(`Character Generation response contains an unexpected Character ID "${characterId}"`)
    }
    if (byId.has(characterId)) {
      throw new LlmResponseFormatError(`Character Generation response contains a duplicate Character ID "${characterId}"`)
    }

    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
    if (!prompt) throw new LlmResponseFormatError(`Character "${characterId}" is missing "prompt"`)
    byId.set(characterId, prompt)
  })

  const missing = expectedCharacterIds.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new LlmResponseFormatError(`Character Generation response is missing prompt(s) for: ${missing.join(', ')}`)
  }

  return expectedCharacterIds.map((characterId) => ({ characterId, prompt: byId.get(characterId)! }))
}
