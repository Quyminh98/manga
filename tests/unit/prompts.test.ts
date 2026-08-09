import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER_DETECTION_PROMPT,
  DEFAULT_CHARACTER_GENERATION_PROMPT,
  DEFAULT_SCENE_GENERATION_PROMPT,
  getMissingPlaceholders
} from '../../src/shared/prompts'

describe('getMissingPlaceholders', () => {
  it('returns an empty array when the required placeholder is present', () => {
    expect(getMissingPlaceholders('characterDetection', 'Analyze {{TRANSCRIPT}} now.')).toEqual([])
  })

  it('reports the missing placeholder when it has been removed', () => {
    expect(getMissingPlaceholders('characterDetection', 'Analyze the transcript now.')).toEqual(['{{TRANSCRIPT}}'])
  })

  it('reports every missing placeholder for a multi-placeholder prompt', () => {
    expect(getMissingPlaceholders('sceneGeneration', 'Just some text with no placeholders.')).toEqual([
      '{{BLOCK_NUMBER}}',
      '{{SRT_TEXT}}',
      '{{RELEVANT_CHARACTERS}}',
      '{{RELEVANT_CHARACTER_PROMPTS}}'
    ])
  })

  it('the default prompts all satisfy their own required placeholders', () => {
    expect(getMissingPlaceholders('characterDetection', DEFAULT_CHARACTER_DETECTION_PROMPT)).toEqual([])
    expect(getMissingPlaceholders('characterGeneration', DEFAULT_CHARACTER_GENERATION_PROMPT)).toEqual([])
    expect(getMissingPlaceholders('sceneGeneration', DEFAULT_SCENE_GENERATION_PROMPT)).toEqual([])
  })
})
