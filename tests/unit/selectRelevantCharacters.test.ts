import { describe, expect, it } from 'vitest'
import {
  buildBatchRelevantCharacterSelectorMessages,
  buildCompactCharacterIndex,
  containsPronounHint,
  matchLocalRelevantCharacterIds,
  parseBatchRelevantCharacterSelectorResponse,
  resolveLocalRelevantCharacterIds
} from '../../src/main/pipeline/selectRelevantCharacters'
import type { Character, SrtBlock } from '../../src/shared/entities'

function makeCharacter(characterId: string, overrides: Partial<Character> = {}): Character {
  return {
    id: `id-${characterId}`,
    projectId: 'project-1',
    characterId,
    name: characterId,
    gender: 'male',
    ageRange: 'adult',
    appearance: 'sharp jaw',
    hair: 'long black hair',
    clothing: 'navy royal robe',
    personality: 'stoic',
    role: 'main character',
    uniqueFeatures: 'scar on left hand',
    visualDna: 'sharp jaw, long black hair, navy royal robe, scar on left hand',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeBlock(blockIndex: number, text: string): SrtBlock {
  return {
    id: `block-${blockIndex}`,
    projectId: 'project-1',
    blockIndex,
    startMs: (blockIndex - 1) * 3000,
    endMs: blockIndex * 3000,
    text,
    characterCount: text.length,
    createdAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('buildCompactCharacterIndex', () => {
  it('formats "@ID | role | short traits" per character, one per line', () => {
    const characters = [
      makeCharacter('@Qin_Hong_Adult', { role: 'main character' }),
      makeCharacter('@Xue_Ge', { role: 'villain', visualDna: 'left cheek scar, black topknot, white armor' })
    ]
    const index = buildCompactCharacterIndex(characters)
    const lines = index.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('@Qin_Hong_Adult | main character | sharp jaw, long black hair, navy royal robe, scar on left hand')
    expect(lines[1]).toBe('@Xue_Ge | villain | left cheek scar, black topknot, white armor')
  })

  it('truncates long Visual DNA rather than including the full text', () => {
    const longDna = 'a'.repeat(200)
    const [line] = buildCompactCharacterIndex([makeCharacter('@Long', { visualDna: longDna })]).split('\n')
    expect(line.length).toBeLessThan(longDna.length)
    expect(line).toContain('…')
  })

  it('never includes the full Character Prompt (spec.md 16.1) — only Visual DNA-derived traits', () => {
    const character = makeCharacter('@Qin_Hong_Adult')
    const index = buildCompactCharacterIndex([character])
    expect(index).not.toContain('character_prompts')
  })
})

describe('matchLocalRelevantCharacterIds', () => {
  it('matches when the readable name derived from the Character ID appears in the SRT text', () => {
    const characters = [makeCharacter('@Qin_Hong_Adult'), makeCharacter('@Xue_Ge')]
    const ids = matchLocalRelevantCharacterIds('Qin Hong drew his sword and faced Xue Ge.', characters)
    expect(ids).toEqual(['@Qin_Hong_Adult', '@Xue_Ge'])
  })

  it('matches on the name with a trailing age/state qualifier dropped', () => {
    const characters = [makeCharacter('@Qin_Hong_Adult')]
    const ids = matchLocalRelevantCharacterIds('Qin Hong walked into the hall.', characters)
    expect(ids).toEqual(['@Qin_Hong_Adult'])
  })

  it('is case-insensitive', () => {
    const characters = [makeCharacter('@Qin_Hong_Adult')]
    expect(matchLocalRelevantCharacterIds('QIN HONG stood still.', characters)).toEqual(['@Qin_Hong_Adult'])
  })

  it('returns an empty array when the text only has pronouns, no confident local match', () => {
    const characters = [makeCharacter('@Qin_Hong_Adult'), makeCharacter('@Xue_Ge')]
    expect(matchLocalRelevantCharacterIds('He looked at her and said nothing.', characters)).toEqual([])
  })
})

describe('containsPronounHint', () => {
  it('detects English third-person pronouns as whole words', () => {
    expect(containsPronounHint('He looked at her and said nothing.')).toBe(true)
    expect(containsPronounHint('They walked away together.')).toBe(true)
  })

  it('does not false-positive on English pronouns appearing as substrings', () => {
    expect(containsPronounHint('He stayed with them in the theater.')).toBe(true) // "he"/"them" are real tokens here
    expect(containsPronounHint('The weather was strange there.')).toBe(false) // "her"/"the" only as substrings
  })

  it('detects Vietnamese third-person pronoun phrases and words', () => {
    expect(containsPronounHint('Cô ấy bước vào phòng.')).toBe(true)
    expect(containsPronounHint('Anh ta rút kiếm ra.')).toBe(true)
    expect(containsPronounHint('Hắn đứng im lặng.')).toBe(true)
  })

  it('returns false for text with no pronoun hint at all', () => {
    expect(containsPronounHint('The door creaked shut.')).toBe(false)
  })
})

describe('resolveLocalRelevantCharacterIds', () => {
  const characters = [makeCharacter('@Qin_Hong_Adult'), makeCharacter('@Xue_Ge')]

  it('resolves a direct name match without needing carry-forward', () => {
    const blocks = [makeBlock(1, 'Qin Hong drew his sword.')]
    const result = resolveLocalRelevantCharacterIds(blocks, characters)
    expect(result.get(1)).toEqual(['@Qin_Hong_Adult'])
  })

  it('carries the last directly-matched character forward onto a later pronoun-only block', () => {
    const blocks = [makeBlock(1, 'Qin Hong drew his sword.'), makeBlock(2, 'He looked around the room.')]
    const result = resolveLocalRelevantCharacterIds(blocks, characters)
    expect(result.get(2)).toEqual(['@Qin_Hong_Adult'])
  })

  it('resets the carried set once a new name is directly matched', () => {
    const blocks = [
      makeBlock(1, 'Qin Hong drew his sword.'),
      makeBlock(2, 'Xue Ge stepped forward.'),
      makeBlock(3, 'He smiled coldly.')
    ]
    const result = resolveLocalRelevantCharacterIds(blocks, characters)
    expect(result.get(3)).toEqual(['@Xue_Ge'])
  })

  it('leaves a block unresolved ([]) when it has a pronoun hint but nothing was matched yet', () => {
    const blocks = [makeBlock(1, 'He looked around the room.')]
    const result = resolveLocalRelevantCharacterIds(blocks, characters)
    expect(result.get(1)).toEqual([])
  })

  it('leaves a block unresolved ([]) when it has neither a direct match nor a pronoun hint', () => {
    const blocks = [makeBlock(1, 'Qin Hong drew his sword.'), makeBlock(2, 'The door creaked shut.')]
    const result = resolveLocalRelevantCharacterIds(blocks, characters)
    expect(result.get(2)).toEqual([])
  })
})

describe('buildBatchRelevantCharacterSelectorMessages', () => {
  it('inlines every block (labeled by number) and the compact index into a single user message', () => {
    const messages = buildBatchRelevantCharacterSelectorMessages(
      [
        { blockNumber: 1, srtWithNeighborContext: 'Current SRT: hello' },
        { blockNumber: 2, srtWithNeighborContext: 'Current SRT: world' }
      ],
      '@A | role | traits'
    )
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('BLOCK 1:\nCurrent SRT: hello')
    expect(messages[0].content).toContain('BLOCK 2:\nCurrent SRT: world')
    expect(messages[0].content).toContain('@A | role | traits')
    expect(messages[0].content).toContain('character_ids')
  })
})

describe('parseBatchRelevantCharacterSelectorResponse', () => {
  const validIds = ['@Qin_Hong_Adult', '@Xue_Ge']

  it('parses a well-formed response with one entry per block', () => {
    const content = JSON.stringify({
      relevant_characters: [
        { block_number: 1, character_ids: ['@Qin_Hong_Adult'] },
        { block_number: 2, character_ids: ['@Xue_Ge'] }
      ]
    })
    const result = parseBatchRelevantCharacterSelectorResponse(content, [1, 2], validIds)
    expect(result.get(1)).toEqual(['@Qin_Hong_Adult'])
    expect(result.get(2)).toEqual(['@Xue_Ge'])
  })

  it('repairs a response wrapped in a markdown code fence', () => {
    const wrapped =
      '```json\n' + JSON.stringify({ relevant_characters: [{ block_number: 1, character_ids: ['@Qin_Hong_Adult'] }] }) + '\n```'
    expect(parseBatchRelevantCharacterSelectorResponse(wrapped, [1], validIds).get(1)).toEqual(['@Qin_Hong_Adult'])
  })

  it('gives a missing block an empty selection instead of throwing', () => {
    const content = JSON.stringify({ relevant_characters: [{ block_number: 1, character_ids: ['@Qin_Hong_Adult'] }] })
    const result = parseBatchRelevantCharacterSelectorResponse(content, [1, 2], validIds)
    expect(result.get(1)).toEqual(['@Qin_Hong_Adult'])
    expect(result.get(2)).toEqual([])
  })

  it('drops unknown Character IDs instead of throwing (internal system logic, spec.md 31)', () => {
    const content = JSON.stringify({
      relevant_characters: [{ block_number: 1, character_ids: ['@Qin_Hong_Adult', '@Someone_Not_In_The_Project'] }]
    })
    expect(parseBatchRelevantCharacterSelectorResponse(content, [1], validIds).get(1)).toEqual(['@Qin_Hong_Adult'])
  })

  it('ignores an entry referencing a block_number outside the requested set', () => {
    const content = JSON.stringify({
      relevant_characters: [
        { block_number: 1, character_ids: ['@Qin_Hong_Adult'] },
        { block_number: 99, character_ids: ['@Xue_Ge'] }
      ]
    })
    const result = parseBatchRelevantCharacterSelectorResponse(content, [1], validIds)
    expect(result.get(1)).toEqual(['@Qin_Hong_Adult'])
    expect(result.has(99)).toBe(false)
  })

  it('deduplicates repeated ids for the same block', () => {
    const content = JSON.stringify({ relevant_characters: [{ block_number: 1, character_ids: ['@Qin_Hong_Adult', '@Qin_Hong_Adult'] }] })
    expect(parseBatchRelevantCharacterSelectorResponse(content, [1], validIds).get(1)).toEqual(['@Qin_Hong_Adult'])
  })

  it('throws for JSON that is unrecoverable even after repair', () => {
    expect(() => parseBatchRelevantCharacterSelectorResponse('not json at all', [1], validIds)).toThrow('not valid JSON')
  })

  it('throws when the "relevant_characters" array is missing', () => {
    expect(() => parseBatchRelevantCharacterSelectorResponse(JSON.stringify({ items: [] }), [1], validIds)).toThrow(
      'relevant_characters'
    )
  })
})
