import { describe, expect, it } from 'vitest'
import {
  buildCharacterDetectionMessages,
  chunkTranscriptForDetection,
  mergeDetectedCharacters,
  parseCharacterDetectionResponse,
  type DetectedCharacter
} from '../../src/main/pipeline/detectCharacters'

describe('buildCharacterDetectionMessages', () => {
  it('replaces {{TRANSCRIPT}} with the transcript in a single user message', () => {
    const messages = buildCharacterDetectionMessages('Analyze:\n{{TRANSCRIPT}}\nEnd.', 'Once upon a time.')
    expect(messages).toEqual([{ role: 'user', content: 'Analyze:\nOnce upon a time.\nEnd.' }])
  })

  it('replaces every occurrence of the placeholder', () => {
    const messages = buildCharacterDetectionMessages('{{TRANSCRIPT}} / {{TRANSCRIPT}}', 'X')
    expect(messages[0].content).toBe('X / X')
  })
})

const validResponse = JSON.stringify({
  characters: [
    {
      name: '@Qin_Hong_Adult',
      gender: 'male',
      age_range: 'adult',
      appearance: 'sharp jaw',
      hair: 'long black hair',
      clothing: 'navy royal robe',
      personality: 'stoic',
      role: 'main character',
      unique_features: 'scar on left hand',
      visual_dna: 'sharp jaw, long black hair, navy royal robe, scar on left hand'
    }
  ]
})

describe('parseCharacterDetectionResponse', () => {
  it('parses a well-formed response', () => {
    const result = parseCharacterDetectionResponse(validResponse)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: '@Qin_Hong_Adult', role: 'main character' })
  })

  it('repairs a response wrapped in a markdown code fence', () => {
    const wrapped = '```json\n' + validResponse + '\n```'
    const result = parseCharacterDetectionResponse(wrapped)
    expect(result).toHaveLength(1)
  })

  it('repairs a response with leading/trailing prose around the JSON object', () => {
    const wrapped = `Here is the result:\n${validResponse}\nLet me know if you need changes.`
    const result = parseCharacterDetectionResponse(wrapped)
    expect(result).toHaveLength(1)
  })

  it('throws for JSON that is unrecoverable even after repair', () => {
    expect(() => parseCharacterDetectionResponse('not json at all, no braces here')).toThrow(
      'not valid JSON'
    )
  })

  it('throws when the "characters" array is missing', () => {
    expect(() => parseCharacterDetectionResponse(JSON.stringify({ people: [] }))).toThrow('characters')
  })

  it('throws when "characters" is an empty array', () => {
    expect(() => parseCharacterDetectionResponse(JSON.stringify({ characters: [] }))).toThrow('no characters')
  })

  it('throws when a character id does not start with @', () => {
    const bad = JSON.stringify({ characters: [{ ...JSON.parse(validResponse).characters[0], name: 'Qin_Hong' }] })
    expect(() => parseCharacterDetectionResponse(bad)).toThrow('must start with @')
  })

  it('throws when visual_dna is missing', () => {
    const bad = JSON.stringify({ characters: [{ ...JSON.parse(validResponse).characters[0], visual_dna: '' }] })
    expect(() => parseCharacterDetectionResponse(bad)).toThrow('visual_dna')
  })

  it('throws on a duplicate Character ID within the same response', () => {
    const one = JSON.parse(validResponse).characters[0]
    const bad = JSON.stringify({ characters: [one, one] })
    expect(() => parseCharacterDetectionResponse(bad)).toThrow('duplicate')
  })

  it('defaults optional string fields to empty string when absent', () => {
    const minimal = JSON.stringify({
      characters: [{ name: '@Bandit', visual_dna: 'shaved head, eye scar' }]
    })
    const result = parseCharacterDetectionResponse(minimal)
    expect(result[0]).toMatchObject({ gender: '', age_range: '', appearance: '', role: '' })
  })
})

// spec.md 35 — Character Detection's Context Too Large fallback.
describe('chunkTranscriptForDetection', () => {
  it('returns a single chunk for a short transcript', () => {
    expect(chunkTranscriptForDetection('Once upon a time.')).toEqual(['Once upon a time.'])
  })

  it('returns [""] for an empty/whitespace-only transcript, not an empty array', () => {
    expect(chunkTranscriptForDetection('   \n\n  ')).toEqual([''])
  })

  it('splits a long transcript into more than 1 chunk, each under the per-chunk budget', () => {
    const paragraph = 'Qin Hong walked through the gate. '.repeat(50) // ~1750 chars
    const transcript = Array.from({ length: 12 }, (_, i) => `${paragraph}Scene ${i}.`).join('\n\n') // >20,000 chars
    const chunks = chunkTranscriptForDetection(transcript)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(6000)
    // Every paragraph must land in exactly one chunk — nothing dropped.
    expect(chunks.join('\n\n')).toContain('Scene 0.')
    expect(chunks.join('\n\n')).toContain('Scene 11.')
  })

  it('still splits a transcript with no blank-line paragraph breaks at all (single giant block)', () => {
    const transcript = 'Qin Hong drew his sword and faced Xue Ge. '.repeat(400) // ~17,200 chars, no \n\n
    const chunks = chunkTranscriptForDetection(transcript)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(6000)
  })
})

function detected(name: string, overrides: Partial<DetectedCharacter> = {}): DetectedCharacter {
  return {
    name,
    gender: '',
    age_range: '',
    appearance: '',
    hair: '',
    clothing: '',
    personality: '',
    role: '',
    unique_features: '',
    visual_dna: `dna-${name}`,
    ...overrides
  }
}

describe('mergeDetectedCharacters', () => {
  it('unions characters across chunks with no overlap', () => {
    const merged = mergeDetectedCharacters([[detected('@A')], [detected('@B')]])
    expect(merged.map((c) => c.name).sort()).toEqual(['@A', '@B'])
  })

  it('dedupes by Character ID, keeping the earliest chunk\'s version on a collision', () => {
    const merged = mergeDetectedCharacters([
      [detected('@A', { visual_dna: 'first chunk version' })],
      [detected('@A', { visual_dna: 'second chunk version' }), detected('@B')]
    ])
    expect(merged).toHaveLength(2)
    expect(merged.find((c) => c.name === '@A')!.visual_dna).toBe('first chunk version')
  })

  it('returns an empty array for no chunks / all-empty chunks', () => {
    expect(mergeDetectedCharacters([])).toEqual([])
    expect(mergeDetectedCharacters([[], []])).toEqual([])
  })
})
