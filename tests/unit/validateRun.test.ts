import { describe, expect, it } from 'vitest'
import { validateProjectForRun } from '../../src/shared/validateRun'

const VALID_PROMPTS = {
  characterDetection: 'Detect {{TRANSCRIPT}}',
  characterGeneration: 'Generate {{CHARACTERS}}',
  sceneGeneration: 'Scene {{BLOCK_NUMBER}} {{SRT_TEXT}} {{RELEVANT_CHARACTERS}} {{RELEVANT_CHARACTER_PROMPTS}}'
}

const VALID_PROJECT = { transcript: 'Some transcript.', avgCharacters: 300, hasCharacters: true }

describe('validateProjectForRun', () => {
  it('passes when everything is configured', () => {
    expect(validateProjectForRun(VALID_PROJECT, VALID_PROMPTS, true, 'gpt-4o')).toBeNull()
  })

  it('blocks on empty transcript', () => {
    expect(validateProjectForRun({ ...VALID_PROJECT, transcript: '   ' }, VALID_PROMPTS, true, 'gpt-4o')).toMatch(/transcript/i)
  })

  it('blocks when the API key is not configured', () => {
    expect(validateProjectForRun(VALID_PROJECT, VALID_PROMPTS, false, 'gpt-4o')).toMatch(/api key/i)
  })

  it('blocks when no model is selected', () => {
    expect(validateProjectForRun(VALID_PROJECT, VALID_PROMPTS, true, null)).toMatch(/model/i)
  })

  it('blocks when avgCharacters is out of range', () => {
    expect(validateProjectForRun({ ...VALID_PROJECT, avgCharacters: 10 }, VALID_PROMPTS, true, 'gpt-4o')).toMatch(/30 and 2000/)
    expect(validateProjectForRun({ ...VALID_PROJECT, avgCharacters: 5000 }, VALID_PROMPTS, true, 'gpt-4o')).toMatch(/30 and 2000/)
  })

  it('allows avgCharacters at the new lower bound', () => {
    expect(validateProjectForRun({ ...VALID_PROJECT, avgCharacters: 30 }, VALID_PROMPTS, true, 'gpt-4o')).toBeNull()
  })

  it('blocks when a required prompt is empty', () => {
    expect(
      validateProjectForRun(VALID_PROJECT, { ...VALID_PROMPTS, characterDetection: '' }, true, 'gpt-4o')
    ).toMatch(/Character Detection prompt is empty/)
  })

  it('blocks when a required placeholder is missing, mirroring spec.md 38\'s example message', () => {
    const message = validateProjectForRun(VALID_PROJECT, { ...VALID_PROMPTS, sceneGeneration: 'no placeholders here' }, true, 'gpt-4o')
    expect(message).toContain('Scene Prompt thiếu')
    expect(message).toContain('{{SRT_TEXT}}')
  })

  it('checks validations in spec.md 38 order — transcript before API key before model', () => {
    const message = validateProjectForRun({ ...VALID_PROJECT, transcript: '' }, VALID_PROMPTS, false, null)
    expect(message).toMatch(/transcript/i)
  })

  it('skips Character Detection/Generation prompt checks for a hasCharacters=false project', () => {
    const project = { ...VALID_PROJECT, hasCharacters: false }
    const prompts = { ...VALID_PROMPTS, characterDetection: '', characterGeneration: '' }
    expect(validateProjectForRun(project, prompts, true, 'gpt-4o')).toBeNull()
  })

  // Phase 22 — a hasCharacters=false project's resolved sceneGeneration
  // string is expected to be the "No Characters" template (resolvePipelineRuntime
  // picks it), which never has {{RELEVANT_CHARACTERS}}/{{RELEVANT_CHARACTER_PROMPTS}}
  // — that must not block the Run, unlike for a hasCharacters=true project.
  it("validates the resolved sceneGeneration string against sceneGenerationNoCharacters's placeholder set for a hasCharacters=false project", () => {
    const project = { ...VALID_PROJECT, hasCharacters: false }
    const prompts = { ...VALID_PROMPTS, sceneGeneration: 'Scene {{BLOCK_NUMBER}} {{SRT_TEXT}}' }

    expect(validateProjectForRun(project, prompts, true, 'gpt-4o')).toBeNull()
    // Same template is still invalid for a hasCharacters=true project.
    expect(validateProjectForRun(VALID_PROJECT, prompts, true, 'gpt-4o')).toContain('{{RELEVANT_CHARACTERS}}')
  })
})
