import { randomUUID } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/client'
import { insertSrtBlocks } from '../../src/main/db/queries/srtBlocks.queries'
import { CharacterService } from '../../src/main/services/CharacterService'
import { ProjectService } from '../../src/main/services/ProjectService'
import { ScenePromptService } from '../../src/main/services/ScenePromptService'
import { SrtService } from '../../src/main/services/SrtService'
import { VilaoApiError, VilaoService } from '../../src/main/services/VilaoService'
import type { LlmChatMessage } from '../../src/main/services/VilaoService'
import type { SrtBlock } from '../../src/shared/entities'

const SCENE_TEMPLATE =
  'BLOCK:\n{{BLOCK_NUMBER}}\nSRT:\n{{SRT_TEXT}}\nCHARS:\n{{RELEVANT_CHARACTERS}}\nREFS:\n{{RELEVANT_CHARACTER_PROMPTS}}'

const TWO_CHARACTERS_JSON = JSON.stringify({
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

// spec.md 30's OUTPUT contract (2026-08-09 — JSON, see plan.md Phase 8
// addendum): { "scene_prompts": [{ "block_number": n, "prompt": "..." }] }.
function scenePromptResponseJson(blockNumbers: number[], promptFor: (n: number) => string = (n) => `Scene ${n}.`): string {
  return JSON.stringify({ scene_prompts: blockNumbers.map((n) => ({ block_number: n, prompt: promptFor(n) })) })
}

// Generic batch-aware fake Vilao response: reads every "BLOCK <n>:" label out
// of the request (the per-SRT labels inside {{SRT_TEXT}}, spec.md 17 batch
// format) and returns one scene_prompts entry per label — mirrors what a
// real batched Scene Generation response looks like regardless of batch size.
function mockBatchedSceneResponses(vilaoService: VilaoService) {
  return vi.spyOn(vilaoService, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
    const content = request.messages[0].content
    const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
    return { content: scenePromptResponseJson(blockNumbers, (n) => `Comic page layout, scene ${n}.`) }
  })
}

function makeSrtBlock(projectId: string, blockIndex: number, text: string): SrtBlock {
  return {
    id: randomUUID(),
    projectId,
    blockIndex,
    startMs: (blockIndex - 1) * 3000,
    endMs: blockIndex * 3000,
    text,
    characterCount: text.length,
    createdAt: new Date().toISOString()
  }
}

let db: Database.Database
let projectService: ProjectService
let srtService: SrtService
let characterService: CharacterService
let scenePromptService: ScenePromptService
let vilaoService: VilaoService

beforeEach(() => {
  db = createDatabase(':memory:')
  projectService = new ProjectService(db)
  srtService = new SrtService(db)
  characterService = new CharacterService(db)
  scenePromptService = new ScenePromptService(db)
  vilaoService = new VilaoService({ apiKey: 'test' })
})

describe('ScenePromptService.generate', () => {
  it('generates exactly one Scene Prompt per SRT block, 1:1 (spec.md 17), batched into a single request when under the batch size', async () => {
    const project = projectService.create(
      { name: 'Scene test', transcript: 'Qin Hong walked in. Xue Ge waited outside. The door creaked shut.' },
      { maxCharacters: 40, fakeDurationSec: 3 }
    )
    const blocks = srtService.split(project.id)
    expect(blocks.length).toBeGreaterThan(1)

    const chatSpy = mockBatchedSceneResponses(vilaoService)

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(blocks.length)
    result.forEach((sp, i) => {
      expect(sp.status).toBe('success')
      expect(sp.blockIndex).toBe(blocks[i].blockIndex)
      expect(sp.srtBlockId).toBe(blocks[i].id)
    })
    expect(scenePromptService.list(project.id)).toEqual(result)
    // All blocks fit in one batch (well under SCENE_PROMPT_BATCH_SIZE = 20) —
    // exactly 1 request generates every scene (no characters detected, so no
    // selector calls either).
    expect(chatSpy).toHaveBeenCalledTimes(1)
  })

  it('selects relevant characters via local name matching without calling the LLM selector', async () => {
    const project = projectService.create({ name: 'Local match', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    vi.spyOn(vilaoService, 'chat').mockResolvedValueOnce({ content: TWO_CHARACTERS_JSON })
    await characterService.detect(project.id, { vilaoService, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })

    projectService.updateTranscript(project.id, 'Qin Hong drew his sword.')
    srtService.split(project.id)

    const chatSpy = mockBatchedSceneResponses(vilaoService)

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(1)
    expect(result[0].relevantCharacterIds).toEqual(['@Qin_Hong_Adult'])
    // Local match found a confident hit — no internal selector call was needed.
    expect(chatSpy).toHaveBeenCalledTimes(1)
    const requestContent = chatSpy.mock.calls[0][0].messages[0].content
    expect(requestContent).toContain('CHARS:\n@Qin_Hong_Adult | main character')
    // Never the full Character Database (e.g. Character Detection's own
    // "unique_features" field) — only the derived sections above.
    expect(requestContent).not.toContain('unique_features')
  })

  it('falls back to the internal LLM selector when local matching finds nothing, and injects only the selected characters', async () => {
    const project = projectService.create({ name: 'LLM select', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    vi.spyOn(vilaoService, 'chat').mockResolvedValueOnce({ content: TWO_CHARACTERS_JSON })
    await characterService.detect(project.id, { vilaoService, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })

    projectService.updateTranscript(project.id, 'He looked at her without saying a word.')
    srtService.split(project.id)

    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request) => {
      const content = request.messages[0].content
      if (content.includes('character_ids')) {
        return { content: JSON.stringify({ character_ids: ['@Xue_Ge'] }) }
      }
      const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
      return { content: scenePromptResponseJson(blockNumbers) }
    })

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result[0].relevantCharacterIds).toEqual(['@Xue_Ge'])
    // 1 selector call + 1 batched scene generation call.
    expect(chatSpy).toHaveBeenCalledTimes(2)
    expect(chatSpy.mock.calls[1][0].messages[0].content).toContain('CHARS:\n@Xue_Ge | villain')
    expect(chatSpy.mock.calls[1][0].messages[0].content).not.toContain('@Qin_Hong_Adult')
  })

  it('falls back to the compact index with no Character Reference when the selector exhausts every retry', async () => {
    const project = projectService.create({ name: 'Selector fails', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    vi.spyOn(vilaoService, 'chat').mockResolvedValueOnce({ content: TWO_CHARACTERS_JSON })
    await characterService.detect(project.id, { vilaoService, promptTemplate: '{{TRANSCRIPT}}', model: 'gpt-4o' })

    projectService.updateTranscript(project.id, 'He looked at her without saying a word.')
    srtService.split(project.id)

    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request) => {
      const content = request.messages[0].content
      if (content.includes('character_ids')) return { content: 'not json' }
      const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
      return { content: scenePromptResponseJson(blockNumbers) }
    })

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result[0].status).toBe('success')
    expect(result[0].relevantCharacterIds).toEqual([])
    // maxRetry (default 3) selector attempts + 1 scene generation call.
    expect(chatSpy).toHaveBeenCalledTimes(project.maxRetry + 1)
    const sceneCall = chatSpy.mock.calls[project.maxRetry][0].messages[0].content
    expect(sceneCall).toContain('CHARS:\n@Qin_Hong_Adult | main character')
    expect(sceneCall).toContain('@Xue_Ge | villain')
    expect(sceneCall).toContain('REFS:\n(omitted — character selection unavailable)')
  })

  it('batches SCENE_PROMPT_BATCH_SIZE (10) SRT blocks per request, and a batch never sees another batch\'s text beyond its 1-block neighbor window', async () => {
    const project = projectService.create({ name: 'Batch boundary', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 25 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    const chatSpy = mockBatchedSceneResponses(vilaoService)

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(25)
    expect(result.every((sp) => sp.status === 'success')).toBe(true)
    // 25 blocks / batch size 10 -> 3 requests (batch of 10, batch of 10, batch of 5).
    expect(chatSpy).toHaveBeenCalledTimes(3)

    // Batches run concurrently (project.sceneConcurrency, default 4) so they
    // may finish — and therefore appear in chatSpy.mock.calls — in either
    // order. Identify each call by its own "BLOCK 0xx:" label instead of by
    // array position.
    const contents = chatSpy.mock.calls.map((call) => call[0].messages[0].content)
    const firstBatchContent = contents.find((c) => c.includes('BLOCK 001:'))!
    const lastBatchContent = contents.find((c) => c.includes('BLOCK 021:'))!

    // Batch 1 (blocks 1-10) may see Marker11 (its 1-block "next" neighbor),
    // but never Marker12 or beyond.
    expect(firstBatchContent).toContain('Marker1 ')
    expect(firstBatchContent).toContain('Marker10 ')
    expect(firstBatchContent).toContain('Marker11 ')
    expect(firstBatchContent).not.toContain('Marker12')
    // Batch 3 (blocks 21-25) may see Marker20 (its 1-block "previous"
    // neighbor), but never Marker19 or earlier — proof the full SRT list
    // isn't being sent in one request.
    expect(lastBatchContent).toContain('Marker25 ')
    expect(lastBatchContent).toContain('Marker21 ')
    expect(lastBatchContent).toContain('Marker20 ')
    expect(lastBatchContent).not.toContain('Marker19')
  })

  it('runs up to project.sceneConcurrency batches concurrently (default 4), not one at a time', async () => {
    const project = projectService.create({ name: 'Concurrency test', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    expect(project.sceneConcurrency).toBe(4)
    const blocks = Array.from({ length: 40 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    // Hold every chat() call open until the test explicitly resolves it, so
    // we can observe how many batches are in flight at once.
    const pendingResolvers: Array<() => void> = []
    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(
      (request) =>
        new Promise((resolve) => {
          const blockNumbers = [...request.messages[0].content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
          pendingResolvers.push(() => resolve({ content: scenePromptResponseJson(blockNumbers) }))
        })
    )

    const generatePromise = scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    // Let all 4 concurrent workers reach their chat() call (microtask-only
    // work in between — no characters detected, so no selector calls).
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(chatSpy).toHaveBeenCalledTimes(4)

    pendingResolvers.forEach((resolve) => resolve())
    const result = await generatePromise

    expect(result).toHaveLength(40)
    expect(result.every((sp) => sp.status === 'success')).toBe(true)
  })

  it('reports live progress via onProgress after each batch, with that batch\'s own results', async () => {
    const project = projectService.create({ name: 'Progress test', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 25 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)
    mockBatchedSceneResponses(vilaoService)

    const events: Array<{ batchesCompleted: number; totalBatches: number; completedBlocks: number; totalBlocks: number; batchBlockIndexes: number[] }> = []
    await scenePromptService.generate(
      project.id,
      { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' },
      (progress) =>
        events.push({
          batchesCompleted: progress.batchesCompleted,
          totalBatches: progress.totalBatches,
          completedBlocks: progress.completedBlocks,
          totalBlocks: progress.totalBlocks,
          batchBlockIndexes: progress.batchResults.map((sp) => sp.blockIndex).sort((a, b) => a - b)
        })
    )

    // 25 blocks / batch size 10 -> 3 batches (10, 10, 5). All 3 fit within
    // sceneConcurrency=4, so they run concurrently — which one finishes first
    // isn't guaranteed — assert the monotonic/aggregate shape instead of a
    // fixed per-event sequence.
    expect(events).toHaveLength(3)
    expect(events.map((e) => e.batchesCompleted)).toEqual([1, 2, 3])
    expect(events.every((e) => e.totalBatches === 3 && e.totalBlocks === 25)).toBe(true)
    // completedBlocks is a running cumulative total — the first event's value
    // is exactly that first batch's own size, and each later event's value
    // only grows.
    expect(events[0].completedBlocks).toBe(events[0].batchBlockIndexes.length)
    for (let i = 1; i < events.length; i++) expect(events[i].completedBlocks).toBeGreaterThan(events[i - 1].completedBlocks)
    expect(events[events.length - 1].completedBlocks).toBe(25)
    const allBlockIndexes = events.flatMap((e) => e.batchBlockIndexes).sort((a, b) => a - b)
    expect(allBlockIndexes).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
  })

  it('throws without calling the LLM when there are no SRT blocks yet', async () => {
    const project = projectService.create({ name: 'No SRT', transcript: 'x' })
    const chatSpy = vi.spyOn(vilaoService, 'chat')

    await expect(
      scenePromptService.generate(project.id, { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' })
    ).rejects.toThrow('Split the transcript')
    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('throws without calling the LLM when the prompt is missing a required placeholder', async () => {
    const project = projectService.create({ name: 'Bad prompt', transcript: 'Some text here.' }, { maxCharacters: 300, fakeDurationSec: 3 })
    srtService.split(project.id)
    const chatSpy = vi.spyOn(vilaoService, 'chat')

    await expect(
      scenePromptService.generate(project.id, { vilaoService, promptTemplate: 'No placeholders here', model: 'gpt-4o' })
    ).rejects.toThrow('{{BLOCK_NUMBER}}')
    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('marks every scene in a failing batch failed, without affecting other batches (batch atomic, spec.md 17)', async () => {
    const project = projectService.create({ name: 'Partial failure', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    // 21 blocks -> batch 1 = blocks 1-20, batch 2 = block 21 alone.
    const blocks = Array.from({ length: 21 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    vi.spyOn(vilaoService, 'chat').mockImplementation(async (request) => {
      const content = request.messages[0].content
      // Match the "BLOCK 021:" label (block 21 as an actual batch member),
      // not just the word "Marker21" — batch 1 also legitimately mentions
      // Marker21 as its "Next SRT" neighbor and must NOT be affected by this.
      if (content.includes('BLOCK 021:')) throw new Error('rate limited')
      const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
      return { content: scenePromptResponseJson(blockNumbers) }
    })

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    const failedBlock = result.find((sp) => sp.blockIndex === 21)!
    expect(failedBlock.status).toBe('failed')
    expect(failedBlock.error).toContain('rate limited')
    result.filter((sp) => sp.blockIndex !== 21).forEach((sp) => expect(sp.status).toBe('success'))
  })

  // Observed live against a real Vilao model (originally against the old
  // plain-text output format — see SceneFormatCollapseError's comment): a
  // >1-block batch sometimes ignores the requested output contract entirely
  // and merges everything into one blob (not valid JSON at all, in the
  // current JSON-output world), and retrying the exact same batch shape
  // reliably reproduces the exact same failure. generateBatch now shrinks
  // the batch (halves it, recursively) whenever this specific failure shape
  // occurs, instead of exhausting maxRetry on a batch shape that's already
  // proven doomed.
  it('recovers from a batch that always collapses into one merged (invalid-JSON) response by splitting down to individual blocks', async () => {
    const project = projectService.create({ name: 'Format collapse', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 4 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request) => {
      const content = request.messages[0].content
      const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
      if (blockNumbers.length > 1) {
        // Same shape as the real bug: one merged blob spanning the whole
        // batch, not valid JSON (the old plain-text habit resurfacing
        // instead of the requested { scene_prompts: [...] } shape).
        return { content: `PROMPT ${blockNumbers[0]}-${blockNumbers[blockNumbers.length - 1]}: merged description` }
      }
      return { content: scenePromptResponseJson(blockNumbers) }
    })

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(4)
    result.forEach((sp) => {
      expect(sp.status).toBe('success')
      // Each block ends up with its own distinct prompt, not the merged text.
      expect(sp.prompt).toBe(`Scene ${sp.blockIndex}.`)
    })
    // 1 batch-of-4 attempt (collapses) -> splits into 2+2, each collapses ->
    // splits into 1+1 (4 leaves) -> 3 collapsed attempts + 4 successes = 7.
    expect(chatSpy).toHaveBeenCalledTimes(7)
  })

  // The other real shape observed live (plan.md Phase 8 addendum, 2026-08-09):
  // not a merged blob, but the model trailing off partway through a batch —
  // valid JSON with a "scene_prompts" array, but only the first block's entry
  // present, the rest silently missing. Same SceneFormatCollapseError, same
  // shrink-and-recurse recovery.
  it('recovers from a batch where the model trails off partway through (present for some blocks, missing the rest)', async () => {
    const project = projectService.create({ name: 'Partial trail-off', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 4 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request) => {
      const content = request.messages[0].content
      const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
      // Only the first block's entry present — valid JSON, just an
      // incomplete "scene_prompts" array (not merged under one entry, a
      // different shape than the other test).
      return { content: scenePromptResponseJson(blockNumbers.slice(0, 1)) }
    })

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result).toHaveLength(4)
    result.forEach((sp) => {
      expect(sp.status).toBe('success')
      expect(sp.prompt).toBe(`Scene ${sp.blockIndex}.`)
    })
    expect(chatSpy).toHaveBeenCalledTimes(7)
  })

  it('does not retry a doomed batch shape 3 times before splitting — stops at the first collapse', async () => {
    const project = projectService.create({ name: 'Format collapse fast-fail', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 2 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request) => {
      const content = request.messages[0].content
      const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
      if (blockNumbers.length > 1) return { content: 'PROMPT 001-002: merged, not valid JSON' }
      return { content: scenePromptResponseJson(blockNumbers) }
    })

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result.every((sp) => sp.status === 'success')).toBe(true)
    // 1 collapsed batch-of-2 attempt (not project.maxRetry=3) + 2 successful
    // single-block calls = 3, proving it split after the first failure
    // instead of burning the full retry budget on the same doomed shape.
    expect(chatSpy).toHaveBeenCalledTimes(3)
  })

  it('list() returns an empty array before Scene Prompt Generation has run', () => {
    const project = projectService.create({ name: 'Ungenerated', transcript: 'x' })
    expect(scenePromptService.list(project.id)).toEqual([])
  })

  // plan.md Phase 9 (Resume, spec.md 19.2/19.3) — a batch whose every block
  // already succeeded must be skipped entirely (no LLM call) on a later
  // generate() call, since generateBatch's all-or-nothing persist means
  // "every block already success" and "nothing left to do" are the same
  // condition for that batch.
  it('skips a batch whose every block already succeeded, without calling the LLM again', async () => {
    const project = projectService.create({ name: 'Resume skip', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 21 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    const chatSpy = mockBatchedSceneResponses(vilaoService)
    const first = await scenePromptService.generate(project.id, { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' })
    expect(first.every((sp) => sp.status === 'success')).toBe(true)
    expect(chatSpy).toHaveBeenCalledTimes(3) // batch of 10, batch of 10, then batch of 1

    chatSpy.mockClear()
    const second = await scenePromptService.generate(project.id, { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' })
    expect(chatSpy).not.toHaveBeenCalled()
    expect(second.every((sp) => sp.status === 'success')).toBe(true)
  })

  it('still re-runs a batch that only partially succeeded (one failing batch does not block a later resume of it)', async () => {
    const project = projectService.create({ name: 'Resume retry', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 5 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    vi.spyOn(vilaoService, 'chat').mockRejectedValue(new Error('down'))
    const failed = await scenePromptService.generate(project.id, { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' })
    expect(failed.every((sp) => sp.status === 'failed')).toBe(true)

    const chatSpy = mockBatchedSceneResponses(vilaoService)
    const resumed = await scenePromptService.generate(project.id, { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' })
    expect(chatSpy).toHaveBeenCalledTimes(1)
    expect(resumed.every((sp) => sp.status === 'success')).toBe(true)
  })

  // plan.md Phase 9 (Pause, spec.md 37) — shouldContinue is polled between
  // batches; once false, no new batch starts, but a batch already in flight
  // (its chat() call already sent, awaiting a response) finishes normally
  // ("request đang chạy được phép hoàn thành"). Uses controlled promises
  // (same technique as the sceneConcurrency test above) so both first calls
  // are genuinely in flight before Pause is simulated — a fully synchronous
  // mock made this nondeterministic (whether the 2nd batch's call had
  // actually been dispatched yet before the flag flipped).
  it('stops starting new batches once shouldContinue() returns false, without aborting in-flight batches', async () => {
    const project = projectService.create({ name: 'Pause mid-generate', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    expect(project.sceneConcurrency).toBe(4)
    // 45 blocks -> 5 batches (10, 10, 10, 10, 5). With concurrency 4, the
    // first 4 batches start together; Pause is requested once all 4 are in
    // flight, so the 5th batch must never start once a worker goes looking
    // for more work.
    const blocks = Array.from({ length: 45 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks)

    let calls = 0
    let stopRequested = false
    const pendingResolvers: Array<() => void> = []
    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(
      (request) =>
        new Promise((resolve) => {
          calls++
          const blockNumbers = [...request.messages[0].content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
          pendingResolvers.push(() => resolve({ content: scenePromptResponseJson(blockNumbers) }))
        })
    )

    const generatePromise = scenePromptService.generate(
      project.id,
      { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' },
      undefined,
      () => !stopRequested
    )

    // Let all 4 concurrent workers' chat() calls actually get dispatched
    // (genuinely in flight, unresolved) before requesting a stop.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(chatSpy).toHaveBeenCalledTimes(4)

    stopRequested = true
    pendingResolvers.forEach((resolve) => resolve())
    const result = await generatePromise

    // All 4 already-in-flight batches were allowed to finish — the 5th
    // (5-block) batch never started once its worker checked shouldContinue().
    expect(calls).toBe(4)
    expect(result.filter((sp) => sp.status === 'success')).toHaveLength(40)
    expect(result).toHaveLength(40)
  })

  // Regression: a project with few enough SRT blocks to fit in a single
  // batch has no "between batches" checkpoint at all — before this fix,
  // shouldContinue() was only checked by runWithConcurrency before starting
  // a *new* batch, so Pause/Cancel had zero effect until that one batch's
  // up-to-maxRetry real LLM calls all finished on their own (plan.md Phase 9
  // user feedback — Pause/Cancel looked completely unresponsive on a small
  // project). Fixed by checking shouldContinue() before every retry attempt
  // too, not just between batches.
  it('stops between retry attempts within a single batch, without exhausting maxRetry or persisting a failed result', async () => {
    const project = projectService.create({ name: 'Pause within one batch', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const blocks = Array.from({ length: 5 }, (_, i) => makeSrtBlock(project.id, i + 1, `Marker${i + 1} spoke now.`))
    insertSrtBlocks(db, blocks) // 5 blocks -> 1 batch, well under the 20-block batch size

    let calls = 0
    let stopRequested = false
    vi.spyOn(vilaoService, 'chat').mockImplementation(async () => {
      calls++
      stopRequested = true // simulate Pause landing right after the first (failing) attempt
      throw new Error('down')
    })

    const result = await scenePromptService.generate(
      project.id,
      { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' },
      undefined,
      () => !stopRequested
    )

    // Only 1 of the up-to-3 (default maxRetry) attempts ran — the retry loop
    // itself stopped, not just the (nonexistent, single-batch) "next batch".
    expect(calls).toBe(1)
    // Nothing persisted as `failed` — an interrupted attempt isn't a genuine
    // exhaustion of maxRetry, so a later Resume must retry it fresh rather
    // than see a stale `failed` row.
    expect(result).toHaveLength(0)
  })
})

describe('ScenePromptService.retry', () => {
  it('regenerates only the requested block, leaving a previously failed sibling untouched', async () => {
    const project = projectService.create(
      { name: 'Retry test', transcript: 'First short line. Second short line.' },
      { maxCharacters: 25, fakeDurationSec: 3 }
    )
    const blocks = srtService.split(project.id)
    expect(blocks.length).toBeGreaterThanOrEqual(2)

    vi.spyOn(vilaoService, 'chat').mockResolvedValue({ content: 'not the expected format' })
    const failedFirst = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })
    expect(failedFirst.every((sp) => sp.status === 'failed')).toBe(true)
    const untouchedUpdatedAt = failedFirst.find((sp) => sp.blockIndex === blocks[1].blockIndex)!.updatedAt

    vi.spyOn(vilaoService, 'chat').mockResolvedValue({ content: scenePromptResponseJson([blocks[0].blockIndex], () => 'Scene text.') })
    const retried = await scenePromptService.retry(project.id, blocks[0].blockIndex, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(retried.status).toBe('success')
    expect(retried.blockIndex).toBe(blocks[0].blockIndex)

    const all = scenePromptService.list(project.id)
    expect(all.find((sp) => sp.blockIndex === blocks[0].blockIndex)!.status).toBe('success')
    const sibling = all.find((sp) => sp.blockIndex === blocks[1].blockIndex)!
    expect(sibling.status).toBe('failed')
    expect(sibling.updatedAt).toBe(untouchedUpdatedAt)
  })

  it('throws when the SRT block does not exist on the project', async () => {
    const project = projectService.create({ name: 'Unknown block', transcript: 'Some text.' }, { maxCharacters: 300, fakeDurationSec: 3 })
    srtService.split(project.id)

    await expect(
      scenePromptService.retry(project.id, 999, { vilaoService, promptTemplate: SCENE_TEMPLATE, model: 'gpt-4o' })
    ).rejects.toThrow('SRT block not found')
  })

  it('preserves the previous successful prompt when a later retry attempt fails', async () => {
    const project = projectService.create({ name: 'Preserve on failure', transcript: 'Some text.' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const [block] = srtService.split(project.id)

    vi.spyOn(vilaoService, 'chat').mockResolvedValue({
      content: scenePromptResponseJson([block.blockIndex], () => 'Original prompt text.')
    })
    const success = await scenePromptService.retry(project.id, block.blockIndex, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })
    expect(success.prompt).toBe('Original prompt text.')

    vi.spyOn(vilaoService, 'chat').mockResolvedValue({ content: 'not the expected format' })
    const failed = await scenePromptService.retry(project.id, block.blockIndex, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(failed.status).toBe('failed')
    expect(failed.prompt).toBe('Original prompt text.')
    expect(failed.id).toBe(success.id)
  })
})

// spec.md 35 — Scene Generation Context Too Large fallback: reactively
// escalates assembleSceneContext's trim level (drop Next SRT, then Previous
// SRT, then the Character Reference prompts) whenever the API itself reports
// the context was too large, on top of the proactive character-count budget
// (generateScenePrompt.test.ts covers assembleSceneContext's minTrimLevel
// directly — these cover ScenePromptService actually driving it from a real
// CONTEXT_TOO_LARGE error).
describe('ScenePromptService — Context Too Large (spec.md 35)', () => {
  it('drops Next SRT and succeeds once the API stops reporting the context as too large', async () => {
    const project = projectService.create(
      { name: 'Scene context too large', transcript: 'First short line. Second short line. Third short line.' },
      { maxCharacters: 20, fakeDurationSec: 3 }
    )
    const blocks = srtService.split(project.id)
    expect(blocks.length).toBeGreaterThanOrEqual(3)
    const middleBlock = blocks[1]

    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request) => {
      const content = request.messages[0].content
      if (content.includes('Next SRT')) {
        throw new VilaoApiError('too long', 400, 'invalid_request_error', 'context_length_exceeded')
      }
      return { content: scenePromptResponseJson([middleBlock.blockIndex], () => 'Trimmed scene.') }
    })

    const result = await scenePromptService.retry(project.id, middleBlock.blockIndex, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result.status).toBe('success')
    expect(result.prompt).toBe('Trimmed scene.')
    // Attempt 1 (level 0, still has Next SRT) fails; attempt 2 (level 1, Next dropped) succeeds.
    expect(chatSpy).toHaveBeenCalledTimes(2)
    expect(chatSpy.mock.calls[1][0].messages[0].content).not.toContain('Next SRT')
    // Attempt 1 did have it — proves this is escalation, not "never sent it".
    expect(chatSpy.mock.calls[0][0].messages[0].content).toContain('Next SRT')
  })

  it('gives up after exhausting maxRetry if the context is still too large even at the maximum trim level', async () => {
    const project = projectService.create({ name: 'Always too large', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
    const [block] = srtService.split(project.id)

    const chatSpy = vi
      .spyOn(vilaoService, 'chat')
      .mockRejectedValue(new VilaoApiError('too long', 400, 'invalid_request_error', 'context_length_exceeded'))

    const result = await scenePromptService.retry(project.id, block.blockIndex, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('CONTEXT_TOO_LARGE')
    expect(chatSpy).toHaveBeenCalledTimes(project.maxRetry)
  })
})

// spec.md 33 — "Nếu API trả rate limit: giảm tốc, retry theo backoff."
describe('ScenePromptService — Rate limit backoff (spec.md 33)', () => {
  it('waits out an increasing backoff between attempts after a rate limit, then succeeds', async () => {
    vi.useFakeTimers()
    try {
      const project = projectService.create({ name: 'Rate limited', transcript: 'x' }, { maxCharacters: 300, fakeDurationSec: 3 })
      const [block] = srtService.split(project.id)

      let calls = 0
      vi.spyOn(vilaoService, 'chat').mockImplementation(async () => {
        calls++
        if (calls < 3) throw new VilaoApiError('Too many requests', 429)
        return { content: scenePromptResponseJson([block.blockIndex], () => 'Scene after backoff.') }
      })

      const retryPromise = scenePromptService.retry(project.id, block.blockIndex, {
        vilaoService,
        promptTemplate: SCENE_TEMPLATE,
        model: 'gpt-4o'
      })

      // Flush the exponential backoff delays (1000ms then 2000ms — well
      // under this) along with the microtasks/retries they gate.
      await vi.advanceTimersByTimeAsync(60_000)
      const result = await retryPromise

      expect(calls).toBe(3)
      expect(result.status).toBe('success')
      expect(result.prompt).toBe('Scene after backoff.')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ScenePromptService with no characters detected', () => {
  it('generates scenes with an empty relevant character list, without ever calling the selector', async () => {
    const project = projectService.create({ name: 'No characters', transcript: 'A quiet empty room.' }, { maxCharacters: 300, fakeDurationSec: 3 })
    srtService.split(project.id)

    const chatSpy = mockBatchedSceneResponses(vilaoService)

    const result = await scenePromptService.generate(project.id, {
      vilaoService,
      promptTemplate: SCENE_TEMPLATE,
      model: 'gpt-4o'
    })

    expect(result[0].relevantCharacterIds).toEqual([])
    expect(chatSpy).toHaveBeenCalledTimes(1)
  })
})
