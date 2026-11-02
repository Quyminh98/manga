import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/client'
import { CharacterService } from '../../src/main/services/CharacterService'
import { ProjectService } from '../../src/main/services/ProjectService'
import { LlmApiError, LlmClient } from '../../src/main/llm/LlmClient'

const VALID_JSON = JSON.stringify({
  characters: [
    {
      name: '@Qin_Hong_Adult',
      gender: 'male',
      age_range: 'adult',
      appearance: 'sharp jaw',
      hair: 'long black hair',
      clothing: 'navy robe',
      personality: 'stoic',
      role: 'main character',
      unique_features: 'scar',
      visual_dna: 'sharp jaw, long black hair, navy robe, scar'
    },
    {
      name: '@Xue_Ge',
      gender: 'male',
      age_range: 'adult',
      appearance: 'tall',
      hair: 'black topknot',
      clothing: 'white armor',
      personality: 'ruthless',
      role: 'villain',
      unique_features: 'left cheek scar',
      visual_dna: 'tall, black topknot, white armor, left cheek scar'
    }
  ]
})

let db: Database.Database
let projectService: ProjectService
let characterService: CharacterService
let llmClient: LlmClient

beforeEach(() => {
  db = createDatabase(':memory:')
  projectService = new ProjectService(db)
  characterService = new CharacterService(db)
  llmClient = new LlmClient({ apiKey: 'test' })
})

describe('CharacterService.detect', () => {
  it('persists characters parsed from the LLM response, mapping name -> characterId/name', async () => {
    const project = projectService.create({ name: 'Detect test', transcript: 'Once upon a time.' })
    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: VALID_JSON })

    const result = await characterService.detect(project.id, {
      llmClient,
      promptTemplate: 'Analyze {{TRANSCRIPT}}',
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ characterId: '@Qin_Hong_Adult', name: '@Qin_Hong_Adult', projectId: project.id })
    expect(characterService.list(project.id)).toEqual(result)
  })

  it('sends exactly one chat() call with the transcript templated in', async () => {
    const project = projectService.create({ name: 'Single call', transcript: 'The hero rode east.' })
    const chatSpy = vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: VALID_JSON })

    await characterService.detect(project.id, {
      llmClient,
      promptTemplate: 'TRANSCRIPT:\n{{TRANSCRIPT}}',
      model: 'gpt-4o'
    })

    expect(chatSpy).toHaveBeenCalledTimes(1)
    expect(chatSpy.mock.calls[0][0]).toEqual({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'TRANSCRIPT:\nThe hero rode east.' }],
      meta: { projectId: project.id, step: 'DETECT_CHARACTERS' },
      jsonMode: true
    })
  })

  it('replaces the previous character set instead of appending on re-run', async () => {
    const project = projectService.create({ name: 'Replace test', transcript: 'Text.' })
    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: VALID_JSON })

    const first = await characterService.detect(project.id, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })
    const second = await characterService.detect(project.id, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })

    expect(characterService.list(project.id)).toHaveLength(2)
    expect(second.map((c) => c.id)).not.toEqual(first.map((c) => c.id))
  })

  it('retries on invalid JSON and succeeds once a later attempt is valid', async () => {
    const project = projectService.create({ name: 'Retry test', transcript: 'Text.' })
    // DEFAULT_MAX_RETRY is 1 (no UI to raise it — ProjectService.ts) — opt
    // this test into a real multi-attempt budget directly via the service,
    // same as Advanced Settings used to before that control was removed.
    projectService.updatePipelineSettings(project.id, { maxRetry: 3, sceneConcurrency: project.sceneConcurrency, sceneBatchSize: project.sceneBatchSize })
    const chatSpy = vi
      .spyOn(llmClient, 'chat')
      .mockResolvedValueOnce({ content: 'not json' })
      .mockResolvedValueOnce({ content: VALID_JSON })

    const result = await characterService.detect(project.id, {
      llmClient,
      promptTemplate: '{{TRANSCRIPT}}',
      model: 'gpt-4o'
    })

    expect(chatSpy).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(2)
  })

  it('fails after exhausting max_retry attempts with a descriptive error, and persists nothing', async () => {
    const project = projectService.create(
      { name: 'Exhausted retries', transcript: 'Text.' }
    )
    const chatSpy = vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: 'not json' })

    await expect(
      characterService.detect(project.id, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })
    ).rejects.toThrow(`Character Detection failed after ${project.maxRetry} attempt(s)`)

    expect(chatSpy).toHaveBeenCalledTimes(project.maxRetry)
    expect(characterService.list(project.id)).toEqual([])
  })

  it('throws without calling the LLM when the transcript is empty', async () => {
    const project = projectService.create({ name: 'Empty transcript', transcript: '   ' })
    const chatSpy = vi.spyOn(llmClient, 'chat')

    await expect(
      characterService.detect(project.id, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })
    ).rejects.toThrow('transcript')
    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('throws without calling the LLM when the prompt is missing {{TRANSCRIPT}}', async () => {
    const project = projectService.create({ name: 'Bad prompt', transcript: 'Text.' })
    const chatSpy = vi.spyOn(llmClient, 'chat')

    await expect(
      characterService.detect(project.id, { llmClient, promptTemplate: 'No placeholder here', model: 'gpt-4o' })
    ).rejects.toThrow('{{TRANSCRIPT}}')
    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('list() returns an empty array before Character Detection has run', () => {
    const project = projectService.create({ name: 'Undetected', transcript: 'Text.' })
    expect(characterService.list(project.id)).toEqual([])
  })

  // spec.md 35 — Character Detection Context Too Large fallback: "1. Chuyển
  // sang chunking transcript. 2. Detect theo chunk. 3. Merge character
  // results."
  it('switches to chunked detection when the API reports the context is too large, and merges results across chunks', async () => {
    const project = projectService.create({
      name: 'Context too large',
      transcript: 'Paragraph about Qin Hong journeying east.\n\nParagraph about Xue Ge waiting in ambush.'
    })

    let callCount = 0
    const chatSpy = vi.spyOn(llmClient, 'chat').mockImplementation(async (request) => {
      callCount++
      if (callCount === 1) {
        // The single full-transcript attempt reports the context is too large.
        throw new LlmApiError('too long', 400, 'invalid_request_error', 'context_length_exceeded')
      }
      const content = request.messages[0].content
      const name = content.includes('Qin Hong') ? '@Qin_Hong' : '@Xue_Ge'
      return {
        content: JSON.stringify({
          characters: [
            {
              name,
              gender: '',
              age_range: '',
              appearance: '',
              hair: '',
              clothing: '',
              personality: '',
              role: '',
              unique_features: '',
              visual_dna: `dna-${name}`
            }
          ]
        })
      }
    })

    const result = await characterService.detect(project.id, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })

    expect(result.map((c) => c.characterId).sort()).toEqual(['@Qin_Hong', '@Xue_Ge'])
    // 1 failed full-transcript attempt (CONTEXT_TOO_LARGE) + 1 call per chunk (2 chunks).
    expect(chatSpy).toHaveBeenCalledTimes(3)
    expect(characterService.list(project.id).map((c) => c.characterId).sort()).toEqual(['@Qin_Hong', '@Xue_Ge'])
  })

  // Phase 12 fix — character_prompts has no FK to characters (business-key
  // relation), so a plain replace of `characters` alone left a stale row
  // behind whenever a regenerate changed/dropped a Character ID.
  it('clears character_prompts wholesale on regenerate, not just characters', async () => {
    const project = projectService.create({ name: 'Regenerate clears prompts', transcript: 'Text.' })
    await detectTwoCharacters(project.id)
    const ids = characterService.list(project.id).map((c) => c.characterId)
    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: generationResponseFor(ids) })
    await characterService.generatePrompts(project.id, { llmClient, promptTemplate: CHAR_GEN_TEMPLATE, model: 'gpt-4o' })
    expect(characterService.listPrompts(project.id)).toHaveLength(2)

    // Regenerate with a completely different Character ID — the old prompts'
    // character_id no longer matches anything in the new Character Database.
    const differentCharacterJson = JSON.stringify({
      characters: [
        {
          name: '@New_Character',
          gender: '',
          age_range: '',
          appearance: '',
          hair: '',
          clothing: '',
          personality: '',
          role: '',
          unique_features: '',
          visual_dna: 'dna'
        }
      ]
    })
    vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({ content: differentCharacterJson })
    await characterService.detect(project.id, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })

    expect(characterService.listPrompts(project.id)).toEqual([])
  })
})

async function detectTwoCharacters(projectId: string): Promise<void> {
  vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({ content: VALID_JSON })
  await characterService.detect(projectId, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })
}

// Detects `count` characters directly via a fake response — used to exercise
// batching (CHARACTER_PROMPT_BATCH_SIZE = 10), which the 2-character fixture
// above can't reach on its own.
async function detectManyCharacters(projectId: string, count: number): Promise<void> {
  const many = Array.from({ length: count }, (_, i) => ({
    name: `@Char_${i}`,
    gender: '',
    age_range: '',
    appearance: '',
    hair: '',
    clothing: '',
    personality: '',
    role: '',
    unique_features: '',
    visual_dna: `dna-${i}`
  }))
  vi.spyOn(llmClient, 'chat').mockResolvedValueOnce({ content: JSON.stringify({ characters: many }) })
  await characterService.detect(projectId, { llmClient, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })
}

const CHAR_GEN_TEMPLATE = 'DATA:\n{{CHARACTERS}}'

function generationResponseFor(characterIds: string[]): string {
  return JSON.stringify({
    character_prompts: characterIds.map((characterId) => ({
      character_id: characterId,
      prompt: `A full body reference image of ${characterId}.`
    }))
  })
}

describe('CharacterService.generatePrompts', () => {
  it('throws without calling the LLM when no characters have been detected yet', async () => {
    const project = projectService.create({ name: 'No characters', transcript: 'Text.' })
    const chatSpy = vi.spyOn(llmClient, 'chat')

    await expect(
      characterService.generatePrompts(project.id, { llmClient, promptTemplate: CHAR_GEN_TEMPLATE, model: 'gpt-4o' })
    ).rejects.toThrow('Detect characters')
    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('throws without calling the LLM when the prompt is missing {{CHARACTERS}}', async () => {
    const project = projectService.create({ name: 'Bad prompt', transcript: 'Text.' })
    await detectTwoCharacters(project.id)
    const chatSpy = vi.spyOn(llmClient, 'chat')

    await expect(
      characterService.generatePrompts(project.id, { llmClient, promptTemplate: 'No placeholder here', model: 'gpt-4o' })
    ).rejects.toThrow('{{CHARACTERS}}')
    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('generates and persists exactly one prompt per detected character', async () => {
    const project = projectService.create({ name: 'Generate', transcript: 'Text.' })
    await detectTwoCharacters(project.id)
    const ids = characterService.list(project.id).map((c) => c.characterId)
    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: generationResponseFor(ids) })

    const result = await characterService.generatePrompts(project.id, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(2)
    for (const prompt of result) {
      expect(prompt.status).toBe('success')
      expect(prompt.prompt).toContain(prompt.characterId)
      expect(prompt.error).toBeNull()
    }
    expect(characterService.listPrompts(project.id)).toEqual(result)
  })

  // Phase 28 — batches are independent, so they run concurrently (up to
  // project.sceneConcurrency at once) instead of one after another.
  it('runs character prompt batches in parallel', async () => {
    const project = projectService.create({ name: 'Parallel', transcript: 'Text.' })
    await detectManyCharacters(project.id, 25)
    const ids = characterService.list(project.id).map((c) => c.characterId)

    let inFlight = 0
    let maxInFlight = 0
    const chatSpy = vi.spyOn(llmClient, 'chat').mockImplementation(async (request) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight -= 1
      const batchIds = ids.filter((id) => request.messages[0].content.includes(`"${id}"`))
      return { content: generationResponseFor(batchIds) }
    })
    chatSpy.mockClear()

    const result = await characterService.generatePrompts(project.id, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(chatSpy).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(3)
    expect(result.filter((p) => p.status === 'success')).toHaveLength(25)
  })

  it('splits into batches of 10 characters per request', async () => {
    const project = projectService.create({ name: 'Batching', transcript: 'Text.' })
    await detectManyCharacters(project.id, 11)

    const ids = characterService.list(project.id).map((c) => c.characterId)
    const chatSpy = vi.spyOn(llmClient, 'chat').mockImplementation(async (request) => {
      // Match on the quoted JSON key form to avoid "@Char_1" false-matching
      // inside "@Char_10"'s substring.
      const batchIds = ids.filter((id) => request.messages[0].content.includes(`"${id}"`))
      return { content: generationResponseFor(batchIds) }
    })
    chatSpy.mockClear() // drop the 1 call already recorded by detectManyCharacters above

    const result = await characterService.generatePrompts(project.id, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(chatSpy).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(11)
    expect(result.every((p) => p.status === 'success')).toBe(true)
  })

  it('marks only the characters in a batch that keeps failing, without touching characters in other batches', async () => {
    const project = projectService.create({ name: 'Partial failure', transcript: 'Text.' })
    await detectManyCharacters(project.id, 11)
    const ids = characterService.list(project.id).map((c) => c.characterId)
    const [firstBatchIds, secondBatchIds] = [ids.slice(0, 10), ids.slice(10)]

    vi.spyOn(llmClient, 'chat').mockImplementation(async (request) => {
      const batchIds = ids.filter((id) => request.messages[0].content.includes(`"${id}"`))
      if (batchIds.some((id) => firstBatchIds.includes(id))) throw new Error('rate limited')
      return { content: generationResponseFor(batchIds) }
    })

    const result = await characterService.generatePrompts(project.id, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result.filter((p) => firstBatchIds.includes(p.characterId)).every((p) => p.status === 'failed')).toBe(true)
    expect(result.filter((p) => secondBatchIds.includes(p.characterId)).every((p) => p.status === 'success')).toBe(true)
    expect(result.find((p) => firstBatchIds.includes(p.characterId))!.error).toContain('rate limited')
  })

  // spec.md 35 — Character Generation Context Too Large fallback: "1. Giảm
  // batch size. 2. Retry." — halves the batch and retries each half
  // independently (same shrink-and-recurse pattern as
  // ScenePromptService.generateBatch's SceneFormatCollapseError handling)
  // instead of exhausting maxRetry on a batch size that's already too big.
  it('halves the batch and retries each half when the API reports the context is too large', async () => {
    const project = projectService.create({ name: 'Char gen context too large', transcript: 'Text.' })
    await detectManyCharacters(project.id, 4)
    const ids = characterService.list(project.id).map((c) => c.characterId)

    const chatSpy = vi.spyOn(llmClient, 'chat').mockImplementation(async (request) => {
      const batchIds = ids.filter((id) => request.messages[0].content.includes(`"${id}"`))
      if (batchIds.length > 1) throw new LlmApiError('too long', 400, 'invalid_request_error', 'context_length_exceeded')
      return { content: generationResponseFor(batchIds) }
    })
    chatSpy.mockClear() // drop the 1 call already recorded by detectManyCharacters above

    const result = await characterService.generatePrompts(project.id, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(4)
    expect(result.every((p) => p.status === 'success')).toBe(true)
    // batch of 4 (fails) -> splits into 2+2 (each fails) -> splits into 4
    // singles (each succeeds): 1 + 1 + 1 + 4 = 7 calls, not 4×maxRetry.
    expect(chatSpy).toHaveBeenCalledTimes(7)
  })
})

describe('CharacterService.retryPrompt', () => {
  it('regenerates only the requested character, leaving a previously failed sibling untouched', async () => {
    const project = projectService.create({ name: 'Retry', transcript: 'Text.' })
    await detectTwoCharacters(project.id)
    const [first, second] = characterService.list(project.id).map((c) => c.characterId)

    // Both characters batch together and fail on the initial generate.
    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: 'not json' })
    await characterService.generatePrompts(project.id, { llmClient, promptTemplate: CHAR_GEN_TEMPLATE, model: 'gpt-4o' })
    expect(characterService.listPrompts(project.id).every((p) => p.status === 'failed')).toBe(true)

    // Retrying just `first` succeeds and must not change `second`'s row.
    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: generationResponseFor([first]) })
    const retried = await characterService.retryPrompt(project.id, first, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(retried.status).toBe('success')
    expect(retried.characterId).toBe(first)

    const all = characterService.listPrompts(project.id)
    expect(all.find((p) => p.characterId === first)!.status).toBe('success')
    expect(all.find((p) => p.characterId === second)!.status).toBe('failed')
  })

  it('throws when the character does not exist on the project', async () => {
    const project = projectService.create({ name: 'Unknown character', transcript: 'Text.' })
    await detectTwoCharacters(project.id)

    await expect(
      characterService.retryPrompt(project.id, '@Nobody', { llmClient, promptTemplate: CHAR_GEN_TEMPLATE, model: 'gpt-4o' })
    ).rejects.toThrow('Character not found')
  })

  it('preserves the previous successful prompt when a later retry attempt fails', async () => {
    const project = projectService.create({ name: 'Preserve on failure', transcript: 'Text.' })
    await detectTwoCharacters(project.id)
    const [first] = characterService.list(project.id).map((c) => c.characterId)

    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: generationResponseFor([first]) })
    const success = await characterService.retryPrompt(project.id, first, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })
    expect(success.status).toBe('success')

    vi.spyOn(llmClient, 'chat').mockResolvedValue({ content: 'not json' })
    const failed = await characterService.retryPrompt(project.id, first, {
      llmClient,
      promptTemplate: CHAR_GEN_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(failed.status).toBe('failed')
    expect(failed.prompt).toBe(success.prompt)
  })
})
