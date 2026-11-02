import { describe, expect, it } from 'vitest'
import {
  formatCharacterListFile,
  formatCharacterPromptsFile,
  formatImagePromptsFile,
  formatSrtFile,
  formatSrtTimestamp,
  sanitizeFolderName
} from '../../src/shared/exportFormat'
import type { Character, CharacterPrompt, ScenePrompt, SrtBlock } from '../../src/shared/entities'

function srtBlock(overrides: Partial<SrtBlock>): SrtBlock {
  return {
    id: 'srt-id',
    projectId: 'p1',
    blockIndex: 1,
    startMs: 0,
    endMs: 3000,
    text: 'Text',
    characterCount: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function character(overrides: Partial<Character>): Character {
  return {
    id: 'c-id',
    projectId: 'p1',
    characterId: '@Char',
    name: 'Char',
    gender: 'unknown',
    ageRange: 'adult',
    appearance: 'appearance',
    hair: 'hair',
    clothing: 'clothing',
    personality: 'personality',
    role: 'role',
    uniqueFeatures: 'unique',
    visualDna: 'dna',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function characterPrompt(overrides: Partial<CharacterPrompt>): CharacterPrompt {
  return {
    id: 'cp-id',
    projectId: 'p1',
    characterId: '@Char',
    prompt: null,
    status: 'success',
    attempts: 1,
    error: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function scenePrompt(overrides: Partial<ScenePrompt>): ScenePrompt {
  return {
    id: 'sp-id',
    projectId: 'p1',
    srtBlockId: 'srt-id',
    blockIndex: 1,
    relevantCharacterIds: [],
    prompt: null,
    status: 'success',
    attempts: 1,
    error: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('formatSrtTimestamp', () => {
  it('formats milliseconds as HH:MM:SS,mmm', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000')
    expect(formatSrtTimestamp(3000)).toBe('00:00:03,000')
    expect(formatSrtTimestamp(3_723_045)).toBe('01:02:03,045')
  })
})

describe('formatSrtFile', () => {
  it('matches spec.md 22\'s exact layout for 3 blocks', () => {
    const blocks = [1, 2, 3].map((i) =>
      srtBlock({ blockIndex: i, startMs: (i - 1) * 3000, endMs: i * 3000, text: `Nội dung block thứ ${i === 1 ? 'nhất' : i === 2 ? 'hai' : 'ba'}.` })
    )
    expect(formatSrtFile(blocks)).toBe(
      `1
00:00:00,000 --> 00:00:03,000
Nội dung block thứ nhất.

2
00:00:03,000 --> 00:00:06,000
Nội dung block thứ hai.

3
00:00:06,000 --> 00:00:09,000
Nội dung block thứ ba.
`
    )
  })

  it('returns an empty string for no blocks', () => {
    expect(formatSrtFile([])).toBe('')
  })
})

describe('formatCharacterPromptsFile', () => {
  it('matches spec.md 23\'s inline layout', () => {
    const characters = [
      character({ characterId: '@Qin_Hong_Adult' }),
      character({ characterId: '@Xue_Ge' }),
      character({ characterId: '@Lin_San' })
    ]
    const prompts = [
      characterPrompt({ characterId: '@Qin_Hong_Adult', prompt: 'Character design of @Qin_Hong_Adult, ...' }),
      characterPrompt({ characterId: '@Xue_Ge', prompt: 'Character design of @Xue_Ge, ...' }),
      characterPrompt({ characterId: '@Lin_San', prompt: 'Character design of @Lin_San, ...' })
    ]
    expect(formatCharacterPromptsFile(characters, prompts)).toBe(
      `@Qin_Hong_Adult: Character design of @Qin_Hong_Adult, ...

@Xue_Ge: Character design of @Xue_Ge, ...

@Lin_San: Character design of @Lin_San, ...
`
    )
  })

  it('skips characters with no successful prompt', () => {
    const characters = [character({ characterId: '@A' }), character({ characterId: '@B' }), character({ characterId: '@C' })]
    const prompts = [
      characterPrompt({ characterId: '@A', prompt: 'Prompt A' }),
      characterPrompt({ characterId: '@B', prompt: null, status: 'failed' }),
      characterPrompt({ characterId: '@C', prompt: 'Prompt C' })
    ]
    expect(formatCharacterPromptsFile(characters, prompts)).toBe('@A: Prompt A\n\n@C: Prompt C\n')
  })

  it('collapses line breaks in stored prompt text to spaces', () => {
    const characters = [character({ characterId: '@A' })]
    const prompts = [characterPrompt({ characterId: '@A', prompt: 'Line one\nLine two\r\nLine three' })]
    expect(formatCharacterPromptsFile(characters, prompts)).toBe('@A: Line one Line two Line three\n')
  })

  it('returns an empty string when nothing has a prompt yet', () => {
    expect(formatCharacterPromptsFile([character({})], [])).toBe('')
  })
})

describe('formatCharacterListFile', () => {
  it('lists every character\'s ID with the "@" prefix stripped, one per line', () => {
    const characters = [
      character({ characterId: '@Hua_An_Ran' }),
      character({ characterId: '@Hua_An_Ran_Original' }),
      character({ characterId: '@Qin_Wan' })
    ]
    expect(formatCharacterListFile(characters)).toBe('Hua_An_Ran\nHua_An_Ran_Original\nQin_Wan\n')
  })

  it('includes a character even without a successful prompt (unlike formatCharacterPromptsFile)', () => {
    const characters = [character({ characterId: '@A' }), character({ characterId: '@B' })]
    expect(formatCharacterListFile(characters)).toBe('A\nB\n')
  })

  it('returns an empty string for no characters', () => {
    expect(formatCharacterListFile([])).toBe('')
  })
})

describe('formatImagePromptsFile', () => {
  it('matches spec.md 24\'s numbering and separator layout, 1:1 with SRT index', () => {
    const scenes = [1, 2, 3].map((i) => scenePrompt({ blockIndex: i, prompt: `Comic page layout, ... ${i}` }))
    expect(formatImagePromptsFile(scenes)).toBe(
      `PROMPT 001: Comic page layout, ... 1

PROMPT 002: Comic page layout, ... 2

PROMPT 003: Comic page layout, ... 3
`
    )
  })

  it('keeps each entry numbered by its own blockIndex when an earlier block has no prompt', () => {
    const scenes = [
      scenePrompt({ blockIndex: 1, prompt: null, status: 'failed' }),
      scenePrompt({ blockIndex: 2, prompt: 'Prompt for scene 2' })
    ]
    expect(formatImagePromptsFile(scenes)).toBe('PROMPT 002: Prompt for scene 2\n')
  })

  it('sorts by blockIndex regardless of input order', () => {
    const scenes = [scenePrompt({ blockIndex: 2, prompt: 'Second' }), scenePrompt({ blockIndex: 1, prompt: 'First' })]
    expect(formatImagePromptsFile(scenes)).toBe('PROMPT 001: First\n\nPROMPT 002: Second\n')
  })
})

describe('sanitizeFolderName', () => {
  it('keeps spaces and unicode as-is', () => {
    expect(sanitizeFolderName('My Project Chương 1', 'Untitled_Project')).toBe('My Project Chương 1')
  })

  it('replaces filesystem-invalid characters', () => {
    expect(sanitizeFolderName('Weird: Name / Test?', 'Untitled_Project')).toBe('Weird_ Name _ Test_')
  })

  it('falls back to the given default when empty after trimming', () => {
    expect(sanitizeFolderName('   ', 'Untitled_Project')).toBe('Untitled_Project')
    expect(sanitizeFolderName('   ', 'Untitled_Channel')).toBe('Untitled_Channel')
  })
})
