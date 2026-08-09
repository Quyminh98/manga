import { describe, expect, it } from 'vitest'
import {
  buildCompactCharacterIndex,
  buildRelevantCharacterSelectorMessages,
  matchLocalRelevantCharacterIds,
  parseRelevantCharacterSelectorResponse
} from '../../src/main/pipeline/selectRelevantCharacters'
import type { Character } from '../../src/shared/entities'

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

describe('buildRelevantCharacterSelectorMessages', () => {
  it('inlines the SRT-with-neighbor-context and compact index into a single user message', () => {
    const messages = buildRelevantCharacterSelectorMessages('Current SRT: hello', '@A | role | traits')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('Current SRT: hello')
    expect(messages[0].content).toContain('@A | role | traits')
    expect(messages[0].content).toContain('character_ids')
  })
})

describe('parseRelevantCharacterSelectorResponse', () => {
  const validIds = ['@Qin_Hong_Adult', '@Xue_Ge']

  it('parses a well-formed response', () => {
    const content = JSON.stringify({ character_ids: ['@Qin_Hong_Adult', '@Xue_Ge'] })
    expect(parseRelevantCharacterSelectorResponse(content, validIds)).toEqual(['@Qin_Hong_Adult', '@Xue_Ge'])
  })

  it('repairs a response wrapped in a markdown code fence', () => {
    const wrapped = '```json\n' + JSON.stringify({ character_ids: ['@Qin_Hong_Adult'] }) + '\n```'
    expect(parseRelevantCharacterSelectorResponse(wrapped, validIds)).toEqual(['@Qin_Hong_Adult'])
  })

  it('drops unknown Character IDs instead of throwing (internal system logic, spec.md 31)', () => {
    const content = JSON.stringify({ character_ids: ['@Qin_Hong_Adult', '@Someone_Not_In_The_Project'] })
    expect(parseRelevantCharacterSelectorResponse(content, validIds)).toEqual(['@Qin_Hong_Adult'])
  })

  it('deduplicates repeated ids', () => {
    const content = JSON.stringify({ character_ids: ['@Qin_Hong_Adult', '@Qin_Hong_Adult'] })
    expect(parseRelevantCharacterSelectorResponse(content, validIds)).toEqual(['@Qin_Hong_Adult'])
  })

  it('throws for JSON that is unrecoverable even after repair', () => {
    expect(() => parseRelevantCharacterSelectorResponse('not json at all', validIds)).toThrow('not valid JSON')
  })

  it('throws when the "character_ids" array is missing', () => {
    expect(() => parseRelevantCharacterSelectorResponse(JSON.stringify({ ids: [] }), validIds)).toThrow('character_ids')
  })
})
