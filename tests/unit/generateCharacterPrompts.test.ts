import { describe, expect, it } from 'vitest'
import {
  buildCharacterGenerationMessages,
  chunkCharacters,
  parseCharacterGenerationResponse
} from '../../src/main/pipeline/generateCharacterPrompts'
import type { Character } from '../../src/shared/entities'

function makeCharacter(characterId: string): Character {
  return {
    id: `id-${characterId}`,
    projectId: 'project-1',
    characterId,
    name: characterId,
    gender: 'male',
    ageRange: 'adult',
    appearance: 'sharp jaw',
    hair: 'long black hair',
    clothing: 'navy robe',
    personality: 'stoic',
    role: 'main character',
    uniqueFeatures: 'scar on left hand',
    visualDna: 'sharp jaw, long black hair, navy robe, scar on left hand',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('chunkCharacters', () => {
  it('returns a single batch when under the batch size', () => {
    const characters = [makeCharacter('@A'), makeCharacter('@B')]
    expect(chunkCharacters(characters, 10)).toEqual([characters])
  })

  it('splits into batches of the given size, preserving order', () => {
    const characters = Array.from({ length: 23 }, (_, i) => makeCharacter(`@C${i}`))
    const batches = chunkCharacters(characters, 10)
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(10)
    expect(batches[1]).toHaveLength(10)
    expect(batches[2]).toHaveLength(3)
    expect(batches.flat()).toEqual(characters)
  })

  it('defaults to a batch size of 10 (spec.md 15)', () => {
    const characters = Array.from({ length: 11 }, (_, i) => makeCharacter(`@C${i}`))
    const batches = chunkCharacters(characters)
    expect(batches[0]).toHaveLength(10)
    expect(batches[1]).toHaveLength(1)
  })

  it('returns an empty array for an empty input', () => {
    expect(chunkCharacters([])).toEqual([])
  })
})

describe('buildCharacterGenerationMessages', () => {
  it('replaces {{CHARACTERS}} with the JSON-serialized character data in a single user message', () => {
    const character = makeCharacter('@Qin_Hong_Adult')
    const messages = buildCharacterGenerationMessages('DATA:\n{{CHARACTERS}}\nEnd.', [character])

    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('DATA:')
    expect(messages[0].content).toContain('"character_id": "@Qin_Hong_Adult"')
    expect(messages[0].content).toContain('"visual_dna"')
    // Internal id/projectId/timestamps aren't part of the model's contract.
    expect(messages[0].content).not.toContain('projectId')
  })

  it('replaces every occurrence of the placeholder', () => {
    const messages = buildCharacterGenerationMessages('{{CHARACTERS}} / {{CHARACTERS}}', [makeCharacter('@A')])
    const [before, after] = messages[0].content.split(' / ')
    expect(before).toBe(after)
  })
})

const twoCharacterResponse = JSON.stringify({
  character_prompts: [
    { character_id: '@Qin_Hong_Adult', prompt: 'A stoic warrior, full body, white background.' },
    { character_id: '@Xue_Ge', prompt: 'A ruthless villain, full body, white background.' }
  ]
})

describe('parseCharacterGenerationResponse', () => {
  const expectedIds = ['@Qin_Hong_Adult', '@Xue_Ge']

  it('parses a well-formed response, returned in the order of the expected ids', () => {
    const result = parseCharacterGenerationResponse(twoCharacterResponse, expectedIds)
    expect(result).toEqual([
      { characterId: '@Qin_Hong_Adult', prompt: 'A stoic warrior, full body, white background.' },
      { characterId: '@Xue_Ge', prompt: 'A ruthless villain, full body, white background.' }
    ])
  })

  it('repairs a response wrapped in a markdown code fence', () => {
    const wrapped = '```json\n' + twoCharacterResponse + '\n```'
    expect(parseCharacterGenerationResponse(wrapped, expectedIds)).toHaveLength(2)
  })

  it('repairs a response with leading/trailing prose around the JSON object', () => {
    const wrapped = `Here you go:\n${twoCharacterResponse}\nDone.`
    expect(parseCharacterGenerationResponse(wrapped, expectedIds)).toHaveLength(2)
  })

  it('throws for JSON that is unrecoverable even after repair', () => {
    expect(() => parseCharacterGenerationResponse('not json at all, no braces here', expectedIds)).toThrow(
      'not valid JSON'
    )
  })

  it('throws when the "character_prompts" array is missing', () => {
    expect(() => parseCharacterGenerationResponse(JSON.stringify({ prompts: [] }), expectedIds)).toThrow(
      'character_prompts'
    )
  })

  it('throws when a Character ID in the response is outside the batch', () => {
    const bad = JSON.stringify({
      character_prompts: [
        { character_id: '@Qin_Hong_Adult', prompt: 'ok' },
        { character_id: '@Someone_Else', prompt: 'ok' }
      ]
    })
    expect(() => parseCharacterGenerationResponse(bad, ['@Qin_Hong_Adult'])).toThrow('unexpected Character ID')
  })

  it('throws when a batch character is missing a prompt in the response', () => {
    const bad = JSON.stringify({ character_prompts: [{ character_id: '@Qin_Hong_Adult', prompt: 'ok' }] })
    expect(() => parseCharacterGenerationResponse(bad, expectedIds)).toThrow('missing prompt(s) for: @Xue_Ge')
  })

  it('throws when an item has an empty prompt', () => {
    const bad = JSON.stringify({
      character_prompts: [
        { character_id: '@Qin_Hong_Adult', prompt: '' },
        { character_id: '@Xue_Ge', prompt: 'ok' }
      ]
    })
    expect(() => parseCharacterGenerationResponse(bad, expectedIds)).toThrow('missing "prompt"')
  })

  it('throws on a duplicate Character ID within the same response', () => {
    const one = { character_id: '@Qin_Hong_Adult', prompt: 'ok' }
    const bad = JSON.stringify({ character_prompts: [one, one] })
    expect(() => parseCharacterGenerationResponse(bad, ['@Qin_Hong_Adult'])).toThrow('duplicate')
  })
})
