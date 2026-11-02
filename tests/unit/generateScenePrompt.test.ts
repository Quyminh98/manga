import { describe, expect, it } from 'vitest'
import {
  SCENE_CONTEXT_CHAR_BUDGET,
  SCENE_PROMPT_BATCH_SIZE,
  assembleSceneContext,
  buildBatchSrtText,
  buildRelevantCharacterPromptsSection,
  buildRelevantCharactersSection,
  buildSceneGenerationMessages,
  chunkSrtBlocks,
  formatBlockNumber,
  formatBlockNumberRange,
  parseSceneGenerationResponse,
  SceneFormatCollapseError,
  type SceneBatchNeighbors
} from '../../src/main/pipeline/generateScenePrompt'
import type { Character, SrtBlock } from '../../src/shared/entities'

function makeBlock(blockIndex: number, text = `Block ${blockIndex} text.`): SrtBlock {
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

describe('formatBlockNumber', () => {
  it('zero-pads to 3 digits (spec.md 8.5/24 — "PROMPT 001")', () => {
    expect(formatBlockNumber(1)).toBe('001')
    expect(formatBlockNumber(28)).toBe('028')
    expect(formatBlockNumber(1234)).toBe('1234')
  })
})

describe('chunkSrtBlocks', () => {
  it('defaults to a batch size of 10 (spec.md 17)', () => {
    const blocks = Array.from({ length: 11 }, (_, i) => makeBlock(i + 1))
    const batches = chunkSrtBlocks(blocks)
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(SCENE_PROMPT_BATCH_SIZE)
    expect(batches[1]).toHaveLength(1)
    expect(batches.flat()).toEqual(blocks)
  })

  it('returns a single batch when under the batch size, preserving order', () => {
    const blocks = [makeBlock(1), makeBlock(2), makeBlock(3)]
    expect(chunkSrtBlocks(blocks, 20)).toEqual([blocks])
  })

  it('returns an empty array for an empty input', () => {
    expect(chunkSrtBlocks([])).toEqual([])
  })
})

describe('formatBlockNumberRange', () => {
  it('returns a single number for a batch of 1 (used by retry)', () => {
    expect(formatBlockNumberRange([makeBlock(7)])).toBe('007')
  })

  it('lists every block number comma-separated for a multi-block batch (not a compressed range)', () => {
    const batch = [makeBlock(1), makeBlock(2), makeBlock(3)]
    expect(formatBlockNumberRange(batch)).toBe('001, 002, 003')
  })

  it('lists all 20 numbers for a full-size batch, not a "001–020" range', () => {
    const batch = Array.from({ length: 20 }, (_, i) => makeBlock(i + 1))
    expect(formatBlockNumberRange(batch)).toBe(
      Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(3, '0')).join(', ')
    )
  })

  it('returns an empty string for an empty batch', () => {
    expect(formatBlockNumberRange([])).toBe('')
  })
})

describe('buildBatchSrtText', () => {
  const neighbors: SceneBatchNeighbors = {
    previous: makeBlock(1, 'Previous line.'),
    batch: [makeBlock(2, 'Second line.'), makeBlock(3, 'Third line.')],
    next: makeBlock(4, 'Next line.')
  }

  it('lists every block in the batch with its own BLOCK <n>: label, plus 1 neighbor on each side (spec.md 17)', () => {
    const text = buildBatchSrtText(neighbors)
    expect(text).toBe(
      'Previous SRT: Previous line.\n\nBLOCK 002:\nSecond line.\n\nBLOCK 003:\nThird line.\n\nNext SRT: Next line.'
    )
  })

  it('omits Previous/Next when there is no neighbor block (first/last batch)', () => {
    const firstBatch: SceneBatchNeighbors = { previous: null, batch: [makeBlock(1, 'First.')], next: makeBlock(2, 'Second.') }
    expect(buildBatchSrtText(firstBatch)).toBe('BLOCK 001:\nFirst.\n\nNext SRT: Second.')

    const lastBatch: SceneBatchNeighbors = { previous: makeBlock(1, 'First.'), batch: [makeBlock(2, 'Last.')], next: null }
    expect(buildBatchSrtText(lastBatch)).toBe('Previous SRT: First.\n\nBLOCK 002:\nLast.')
  })

  it('can omit Previous/Next explicitly even when the neighbor blocks exist (used by priority trimming)', () => {
    expect(buildBatchSrtText(neighbors, false, false)).toBe('BLOCK 002:\nSecond line.\n\nBLOCK 003:\nThird line.')
  })

  it('never includes more than 1 previous/1 next block regardless of batch size', () => {
    const text = buildBatchSrtText(neighbors)
    expect(text.match(/Previous SRT/g)).toHaveLength(1)
    expect(text.match(/Next SRT/g)).toHaveLength(1)
  })
})

describe('buildRelevantCharactersSection / buildRelevantCharacterPromptsSection', () => {
  it('formats "@ID | role | full Visual DNA" (not truncated, unlike the compact index)', () => {
    const longDna = 'a'.repeat(200)
    const section = buildRelevantCharactersSection([makeCharacter('@Qin_Hong_Adult', { visualDna: longDna })])
    expect(section).toContain(longDna)
  })

  it('returns "(none)" for an empty relevant character list', () => {
    expect(buildRelevantCharactersSection([])).toBe('(none)')
    expect(buildRelevantCharacterPromptsSection([], new Map())).toBe('(none)')
  })

  it('omits characters that have no generated reference prompt yet', () => {
    const characters = [makeCharacter('@A'), makeCharacter('@B')]
    const section = buildRelevantCharacterPromptsSection(characters, new Map([['@A', 'A full body reference of @A.']]))
    expect(section).toContain('@A: A full body reference of @A.')
    expect(section).not.toContain('@B')
  })
})

describe('assembleSceneContext', () => {
  const singleBlockNeighbors: SceneBatchNeighbors = {
    previous: makeBlock(1, 'Previous line.'),
    batch: [makeBlock(2, 'Current line.')],
    next: makeBlock(3, 'Next line.')
  }

  it('keeps everything when comfortably under budget', () => {
    const result = assembleSceneContext({
      neighbors: singleBlockNeighbors,
      relevantCharactersSection: '@A | main character | sharp jaw',
      relevantCharacterPromptsSection: '@A: A full body reference.',
      fixedOverheadEstimate: 100
    })
    expect(result.srtText).toContain('Previous SRT')
    expect(result.srtText).toContain('Next SRT')
    expect(result.relevantCharacterPrompts).toBe('@A: A full body reference.')
  })

  it('drops Next SRT first when over budget (spec.md 18.4 priority #6)', () => {
    const result = assembleSceneContext({
      neighbors: singleBlockNeighbors,
      relevantCharactersSection: 'x'.repeat(100),
      relevantCharacterPromptsSection: 'y'.repeat(100),
      fixedOverheadEstimate: SCENE_CONTEXT_CHAR_BUDGET - 260
    })
    expect(result.srtText).toContain('Previous SRT')
    expect(result.srtText).not.toContain('Next SRT')
    expect(result.srtText).toContain('BLOCK 002')
  })

  it('drops Previous SRT next if dropping Next SRT alone is not enough (priority #5)', () => {
    const result = assembleSceneContext({
      neighbors: singleBlockNeighbors,
      relevantCharactersSection: 'x'.repeat(50),
      relevantCharacterPromptsSection: 'y'.repeat(50),
      fixedOverheadEstimate: SCENE_CONTEXT_CHAR_BUDGET - 80
    })
    expect(result.srtText).not.toContain('Previous SRT')
    expect(result.srtText).not.toContain('Next SRT')
    expect(result.srtText).toContain('BLOCK 002')
  })

  it('drops Relevant Character Reference prompts last, after both neighbors (priority #4)', () => {
    const result = assembleSceneContext({
      neighbors: singleBlockNeighbors,
      relevantCharactersSection: 'x'.repeat(10),
      relevantCharacterPromptsSection: 'y'.repeat(10_000),
      fixedOverheadEstimate: 10
    })
    expect(result.srtText).not.toContain('Previous SRT')
    expect(result.srtText).not.toContain('Next SRT')
    expect(result.srtText).toContain('BLOCK 002')
    expect(result.relevantCharacterPrompts).not.toContain('y')
  })

  it('never drops any block’s SRT text or relevant characters’ Visual DNA, even far over budget (priority #1/#2)', () => {
    const result = assembleSceneContext({
      neighbors: singleBlockNeighbors,
      relevantCharactersSection: '@A | role | ' + 'z'.repeat(50_000),
      relevantCharacterPromptsSection: 'y'.repeat(50_000),
      fixedOverheadEstimate: 50_000
    })
    expect(result.srtText).toContain('BLOCK 002:\nCurrent line.')
    expect(result.relevantCharacters).toContain('z'.repeat(50_000))
  })

  it('when Relevant Character Reference is null (spec.md 31 total-selector-failure fallback), never re-adds it', () => {
    const result = assembleSceneContext({
      neighbors: singleBlockNeighbors,
      relevantCharactersSection: '@A | role | traits',
      relevantCharacterPromptsSection: null,
      fixedOverheadEstimate: 10
    })
    expect(result.relevantCharacterPrompts).toBe('(omitted — character selection unavailable)')
  })

  // spec.md 35 — Scene Generation Context Too Large fallback: forces trimming
  // regardless of the character-count budget estimate, used reactively by
  // ScenePromptService.generateBatch when the API itself reports the context
  // was too large.
  it('minTrimLevel 1 force-drops Next SRT even when comfortably under budget', () => {
    const result = assembleSceneContext(
      {
        neighbors: singleBlockNeighbors,
        relevantCharactersSection: '@A | main character | sharp jaw',
        relevantCharacterPromptsSection: '@A: A full body reference.',
        fixedOverheadEstimate: 10
      },
      1
    )
    expect(result.srtText).toContain('Previous SRT')
    expect(result.srtText).not.toContain('Next SRT')
    expect(result.relevantCharacterPrompts).toBe('@A: A full body reference.')
  })

  it('minTrimLevel 2 force-drops both Next and Previous SRT', () => {
    const result = assembleSceneContext(
      {
        neighbors: singleBlockNeighbors,
        relevantCharactersSection: '@A | main character | sharp jaw',
        relevantCharacterPromptsSection: '@A: A full body reference.',
        fixedOverheadEstimate: 10
      },
      2
    )
    expect(result.srtText).not.toContain('Previous SRT')
    expect(result.srtText).not.toContain('Next SRT')
    expect(result.srtText).toContain('BLOCK 002:\nCurrent line.')
    expect(result.relevantCharacterPrompts).toBe('@A: A full body reference.')
  })

  it('minTrimLevel 3 force-drops Next/Previous SRT and the Character Reference prompts, leaving only Visual DNA', () => {
    const result = assembleSceneContext(
      {
        neighbors: singleBlockNeighbors,
        relevantCharactersSection: '@A | main character | sharp jaw',
        relevantCharacterPromptsSection: '@A: A full body reference.',
        fixedOverheadEstimate: 10
      },
      3
    )
    expect(result.srtText).not.toContain('Previous SRT')
    expect(result.srtText).not.toContain('Next SRT')
    expect(result.srtText).toContain('BLOCK 002:\nCurrent line.')
    expect(result.relevantCharacterPrompts).not.toContain('A full body reference')
    // Visual DNA (relevantCharactersSection) is never dropped, even at the
    // highest trim level — spec.md 35's floor ("relevant Character ID/Visual
    // DNA cốt lõi" must never be dropped).
    expect(result.relevantCharacters).toBe('@A | main character | sharp jaw')
  })

  it('minTrimLevel never re-adds something the budget check would otherwise keep', () => {
    // Same comfortably-under-budget input as the very first "keeps
    // everything" test, but forced to level 3 — the forced trims must win
    // even though nothing here is actually over budget.
    const result = assembleSceneContext(
      {
        neighbors: singleBlockNeighbors,
        relevantCharactersSection: '@A | main character | sharp jaw',
        relevantCharacterPromptsSection: '@A: A full body reference.',
        fixedOverheadEstimate: 100
      },
      3
    )
    expect(result.srtText).not.toContain('Previous SRT')
    expect(result.srtText).not.toContain('Next SRT')
    expect(result.relevantCharacterPrompts).not.toContain('A full body reference')
  })

  it('defaults minTrimLevel to 0 (budget-estimate only) when omitted, unchanged from before Phase 12', () => {
    const result = assembleSceneContext({
      neighbors: singleBlockNeighbors,
      relevantCharactersSection: '@A | main character | sharp jaw',
      relevantCharacterPromptsSection: '@A: A full body reference.',
      fixedOverheadEstimate: 100
    })
    expect(result.srtText).toContain('Previous SRT')
    expect(result.srtText).toContain('Next SRT')
  })

  it('scales the budget up for larger batches (more room before trimming kicks in)', () => {
    const bigBatch: SceneBatchNeighbors = {
      previous: makeBlock(0, 'Previous line.'),
      batch: Array.from({ length: 20 }, (_, i) => makeBlock(i + 1)),
      next: makeBlock(21, 'Next line.')
    }
    // This overhead would force trimming for a single-block batch (see the
    // "drops Next SRT first" case above using the same-ish overhead), but a
    // 20-block batch's larger budget should comfortably absorb it.
    const result = assembleSceneContext({
      neighbors: bigBatch,
      relevantCharactersSection: 'x'.repeat(100),
      relevantCharacterPromptsSection: 'y'.repeat(100),
      fixedOverheadEstimate: 200
    })
    expect(result.srtText).toContain('Previous SRT')
    expect(result.srtText).toContain('Next SRT')
    expect(result.relevantCharacterPrompts).toBe('y'.repeat(100))
  })
})

describe('buildSceneGenerationMessages', () => {
  it('replaces all 4 placeholders in a single user message', () => {
    const template = 'BLOCK:\n{{BLOCK_NUMBER}}\nSRT:\n{{SRT_TEXT}}\nCHARS:\n{{RELEVANT_CHARACTERS}}\nREFS:\n{{RELEVANT_CHARACTER_PROMPTS}}'
    const messages = buildSceneGenerationMessages(template, '007–009', {
      srtText: 'BLOCK 007:\nhello',
      relevantCharacters: '@A | role | traits',
      relevantCharacterPrompts: '@A: prompt'
    })
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toContain('007–009')
    expect(messages[0].content).toContain('BLOCK 007:\nhello')
    expect(messages[0].content).toContain('@A | role | traits')
    expect(messages[0].content).toContain('@A: prompt')
  })
})

// spec.md 30's OUTPUT contract (2026-08-09 — JSON, see plan.md Phase 8
// addendum): { "scene_prompts": [{ "block_number": n, "prompt": "..." }] }.
const threeSceneResponse = JSON.stringify({
  scene_prompts: [
    { block_number: 1, prompt: 'First scene.' },
    { block_number: 2, prompt: 'Second scene.' },
    { block_number: 3, prompt: 'Third scene.' }
  ]
})

describe('parseSceneGenerationResponse', () => {
  it('extracts the prompt text for a single block', () => {
    const content = JSON.stringify({ scene_prompts: [{ block_number: 7, prompt: 'Comic page layout, a warrior stands in the rain.' }] })
    expect(parseSceneGenerationResponse(content, [7])).toEqual(new Map([[7, 'Comic page layout, a warrior stands in the rain.']]))
  })

  it('parses a batched response with multiple scene_prompts entries', () => {
    const result = parseSceneGenerationResponse(threeSceneResponse, [1, 2, 3])
    expect(result.get(1)).toBe('First scene.')
    expect(result.get(2)).toBe('Second scene.')
    expect(result.get(3)).toBe('Third scene.')
  })

  it('collapses newlines the model still emits inside a prompt into single spaces (spec.md 30 rule 10)', () => {
    const content = JSON.stringify({
      scene_prompts: [
        { block_number: 1, prompt: 'Panel 1 (top, wide): a hero stands tall.\n\nPanel 2 (bottom, small): rain falls.  --ar 16:9' }
      ]
    })
    expect(parseSceneGenerationResponse(content, [1]).get(1)).toBe(
      'Panel 1 (top, wide): a hero stands tall. Panel 2 (bottom, small): rain falls. --ar 16:9'
    )
  })

  it('repairs a response wrapped in a markdown code fence', () => {
    const wrapped = '```json\n' + threeSceneResponse + '\n```'
    expect(parseSceneGenerationResponse(wrapped, [1, 2, 3]).size).toBe(3)
  })

  it('repairs a response with leading/trailing prose around the JSON object', () => {
    const wrapped = `Here you go:\n${threeSceneResponse}\nDone.`
    expect(parseSceneGenerationResponse(wrapped, [1, 2, 3]).size).toBe(3)
  })

  it('throws SceneFormatCollapseError for a response that is not valid JSON even after repair', () => {
    expect(() => parseSceneGenerationResponse('Just a scene description, not JSON at all.', [1])).toThrow('not valid JSON')
    expect(() => parseSceneGenerationResponse('Just a scene description, not JSON at all.', [1])).toThrow(SceneFormatCollapseError)
  })

  it('throws SceneFormatCollapseError when the "scene_prompts" array is missing', () => {
    expect(() => parseSceneGenerationResponse(JSON.stringify({ prompts: [] }), [1])).toThrow('scene_prompts')
  })

  it('throws SceneFormatCollapseError when an item references a block_number outside the batch', () => {
    const bad = JSON.stringify({ scene_prompts: [{ block_number: 1, prompt: 'ok' }, { block_number: 99, prompt: 'ok' }] })
    expect(() => parseSceneGenerationResponse(bad, [1])).toThrow('unexpected block_number')
  })

  it('throws SceneFormatCollapseError on a duplicate block_number within the same response', () => {
    const one = { block_number: 1, prompt: 'ok' }
    const bad = JSON.stringify({ scene_prompts: [one, one] })
    expect(() => parseSceneGenerationResponse(bad, [1])).toThrow('duplicate block_number')
  })

  it('throws SceneFormatCollapseError when an item has an empty prompt', () => {
    const bad = JSON.stringify({ scene_prompts: [{ block_number: 1, prompt: '' }] })
    expect(() => parseSceneGenerationResponse(bad, [1])).toThrow('missing "prompt"')
  })

  // Same error class as "not valid JSON" above — a model that trails off
  // partway through a batch (present for some blocks, missing others)
  // reproduces identically on a bare retry just as reliably as a fully
  // merged/invalid response does (observed live), so
  // ScenePromptService.generateBatch treats both as the same "shrink the
  // batch" signal.
  it('throws SceneFormatCollapseError (failing the whole batch) when any requested block is missing from the response', () => {
    const content = JSON.stringify({
      scene_prompts: [
        { block_number: 1, prompt: 'First scene.' },
        { block_number: 3, prompt: 'Third scene.' }
      ]
    })
    expect(() => parseSceneGenerationResponse(content, [1, 2, 3])).toThrow('missing prompt(s) for block(s): 002')
    expect(() => parseSceneGenerationResponse(content, [1, 2, 3])).toThrow(SceneFormatCollapseError)
  })
})
