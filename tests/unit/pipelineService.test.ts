import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/client'
import { ProjectService } from '../../src/main/services/ProjectService'
import { PipelineService, type PipelineRuntime } from '../../src/main/services/PipelineService'
import { VilaoService } from '../../src/main/services/VilaoService'
import type { LlmChatMessage } from '../../src/main/services/VilaoService'
import { ProjectStatus, TaskStatus, TaskType } from '../../src/shared/enums'
import type { PipelineTask } from '../../src/shared/entities'

const CHARACTER_JSON = JSON.stringify({
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
    }
  ]
})

function characterPromptJson(): string {
  return JSON.stringify({ character_prompts: [{ character_id: '@Qin_Hong_Adult', prompt: 'A full body reference image.' }] })
}

// Distinguishes which pipeline step is calling chat() by the marker prefix
// baked into each of the 3 prompt templates below — same technique
// scenePromptService.test.ts uses for its batched-scene mock, generalized to
// cover all 3 LLM-backed steps PipelineService drives. spec.md 30's OUTPUT
// contract (2026-08-09 — JSON, see plan.md Phase 8 addendum): { scene_prompts:
// [{ block_number, prompt }] }.
function sceneResponseFor(content: string): string {
  const blockNumbers = [...content.matchAll(/BLOCK (\d+):/g)].map((m) => Number(m[1]))
  return JSON.stringify({
    scene_prompts: blockNumbers.map((n) => ({ block_number: n, prompt: `Comic page layout, scene ${n}.` }))
  })
}

function mockAllStepsSucceed(vilaoService: VilaoService) {
  return vi.spyOn(vilaoService, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
    const content = request.messages[0].content
    if (content.startsWith('DETECT')) return { content: CHARACTER_JSON }
    if (content.startsWith('GENERATE_CHAR_PROMPT')) return { content: characterPromptJson() }
    if (content.startsWith('SCENE')) return { content: sceneResponseFor(content) }
    throw new Error(`Unexpected prompt content: ${content.slice(0, 30)}`)
  })
}

const PROMPT_SETTINGS = {
  characterDetection: 'DETECT\n{{TRANSCRIPT}}',
  characterGeneration: 'GENERATE_CHAR_PROMPT\n{{CHARACTERS}}',
  sceneGeneration: 'SCENE\n{{BLOCK_NUMBER}}\n{{SRT_TEXT}}\n{{RELEVANT_CHARACTERS}}\n{{RELEVANT_CHARACTER_PROMPTS}}'
}

let db: Database.Database
let projectService: ProjectService
let pipelineService: PipelineService
let vilaoService: VilaoService

beforeEach(() => {
  db = createDatabase(':memory:')
  projectService = new ProjectService(db)
  pipelineService = new PipelineService(db)
  vilaoService = new VilaoService({ apiKey: 'test' })
})

function runtime(overrides: Partial<PipelineRuntime> = {}): PipelineRuntime {
  return { vilaoService, model: 'gpt-4o', promptSettings: PROMPT_SETTINGS, hasApiKey: true, ...overrides }
}

describe('PipelineService.runProject — validation (spec.md 38)', () => {
  it('rejects and makes no changes when no API key is configured', async () => {
    const project = projectService.create({ name: 'No key', transcript: 'Hello world.' })
    const chatSpy = vi.spyOn(vilaoService, 'chat')

    await expect(pipelineService.runProject(project.id, runtime({ hasApiKey: false }))).rejects.toThrow(/API key/)

    expect(chatSpy).not.toHaveBeenCalled()
    expect(projectService.get(project.id)?.status).toBe(ProjectStatus.DRAFT)
  })

  it('rejects when the transcript is empty', async () => {
    const project = projectService.create({ name: 'Empty transcript', transcript: '   ' })
    await expect(pipelineService.runProject(project.id, runtime())).rejects.toThrow(/transcript/i)
  })

  it('rejects when no model is selected', async () => {
    const project = projectService.create({ name: 'No model', transcript: 'Hello world.' })
    await expect(pipelineService.runProject(project.id, runtime({ model: null }))).rejects.toThrow(/model/i)
  })
})

describe('PipelineService.runProject — full run (spec.md 36)', () => {
  it('runs Split SRT -> Detect Characters -> Character Prompts -> Scene Generation end to end and marks the project completed', async () => {
    const project = projectService.create(
      { name: 'Full run', transcript: 'Qin Hong walked in. The door creaked shut.' },
      { maxCharacters: 100, fakeDurationSec: 3 }
    )
    mockAllStepsSucceed(vilaoService)

    const updates: PipelineTask[] = []
    await pipelineService.runProject(project.id, runtime(), (task) => updates.push(task))

    const finalProject = projectService.get(project.id)!
    expect(finalProject.status).toBe(ProjectStatus.COMPLETED)

    const tasks = pipelineService.listTasks(project.id)
    expect(tasks).toHaveLength(3)
    expect(tasks.every((t) => t.status === TaskStatus.SUCCESS)).toBe(true)
    expect(updates.some((t) => t.taskType === TaskType.DETECT_CHARACTERS && t.status === TaskStatus.RUNNING)).toBe(true)
    expect(updates.some((t) => t.taskType === TaskType.DETECT_CHARACTERS && t.status === TaskStatus.SUCCESS)).toBe(true)
  })

  it('snapshots prompts/model/settings exactly once, on the first Run (spec.md 32)', async () => {
    const project = projectService.create({ name: 'Snapshot test', transcript: 'Qin Hong walked in.' })
    expect(project.characterDetectionPromptSnapshot).toBeNull()

    mockAllStepsSucceed(vilaoService)
    await pipelineService.runProject(project.id, runtime())

    const afterFirstRun = projectService.get(project.id)!
    expect(afterFirstRun.characterDetectionPromptSnapshot).toBe(PROMPT_SETTINGS.characterDetection)
    expect(afterFirstRun.selectedModelSnapshot).toBe('gpt-4o')
    expect(afterFirstRun.selectedModel).toBe('gpt-4o')

    // A second Run (Resume, with everything already done) must not overwrite
    // the snapshot even if the live prompt settings changed since.
    await pipelineService.runProject(project.id, runtime({ promptSettings: { ...PROMPT_SETTINGS, characterDetection: 'DETECT_CHANGED\n{{TRANSCRIPT}}' } }))
    expect(projectService.get(project.id)!.characterDetectionPromptSnapshot).toBe(PROMPT_SETTINGS.characterDetection)
  })

  it('rejects a second concurrent run for the same project', async () => {
    const project = projectService.create({ name: 'Concurrent', transcript: 'Qin Hong walked in.' })
    mockAllStepsSucceed(vilaoService)

    const first = pipelineService.runProject(project.id, runtime())
    await expect(pipelineService.runProject(project.id, runtime())).rejects.toThrow(/already running/i)
    await first
  })
})

describe('PipelineService.runProject — Pause/Resume (spec.md 37/19.3)', () => {
  it('stops before Character Prompts once Pause is requested mid-run, then Resume continues from there without re-running earlier steps', async () => {
    const project = projectService.create({ name: 'Pause test', transcript: 'Qin Hong walked in.' })

    // Pause is requested synchronously while the DETECT call is in flight —
    // by the time detectCharacters() resolves and PipelineService checks
    // controller.stopRequested (right after the DETECT_CHARACTERS gate), the
    // flag is already set, so it must stop before Character Prompts.
    const chatSpy = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
      const content = request.messages[0].content
      if (content.startsWith('DETECT')) {
        pipelineService.pause(project.id)
        return { content: CHARACTER_JSON }
      }
      if (content.startsWith('GENERATE_CHAR_PROMPT')) return { content: characterPromptJson() }
      if (content.startsWith('SCENE')) return { content: sceneResponseFor(content) }
      throw new Error('unexpected')
    })

    await pipelineService.runProject(project.id, runtime())

    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.PAUSED)
    const tasks = pipelineService.listTasks(project.id)
    expect(tasks.find((t) => t.taskType === TaskType.DETECT_CHARACTERS)?.status).toBe(TaskStatus.SUCCESS)
    expect(tasks.find((t) => t.taskType === TaskType.GENERATE_CHARACTER_PROMPTS)?.status).toBe(TaskStatus.PENDING)
    expect(chatSpy).toHaveBeenCalledTimes(1)

    // Resume: re-invoking runProject() must not call chat() for DETECT again
    // (characters already exist) — only Character Prompts + Scene Generation.
    chatSpy.mockClear()
    await pipelineService.runProject(project.id, runtime())

    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.COMPLETED)
    expect(chatSpy.mock.calls.some((c) => (c[0] as { messages: LlmChatMessage[] }).messages[0].content.startsWith('DETECT'))).toBe(
      false
    )
    expect(pipelineService.listTasks(project.id).every((t) => t.status === TaskStatus.SUCCESS)).toBe(true)
  })

  it('cancel() also leaves the project paused and resumable, without losing completed work', async () => {
    const project = projectService.create({ name: 'Cancel test', transcript: 'Qin Hong walked in.' })
    vi.spyOn(vilaoService, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
      const content = request.messages[0].content
      if (content.startsWith('DETECT')) {
        pipelineService.cancel(project.id)
        return { content: CHARACTER_JSON }
      }
      return { content: characterPromptJson() }
    })

    await pipelineService.runProject(project.id, runtime())

    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.PAUSED)
    // Completed work (Split SRT + Character Detection) survives the cancel.
    expect(db.prepare('SELECT COUNT(*) as n FROM srt_blocks WHERE project_id = ?').get(project.id)).toMatchObject({ n: expect.any(Number) })
    expect(db.prepare('SELECT COUNT(*) as n FROM characters WHERE project_id = ?').get(project.id)).toEqual({ n: 1 })
  })

  it('pause() on a project with no in-memory controller (e.g. after an app restart) still marks it paused', () => {
    const project = projectService.create({ name: 'Idle pause', transcript: 'Text.' })
    pipelineService.pause(project.id)
    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.PAUSED)
  })
})

describe('PipelineService.runProject — Scene failures do not fail the whole project (spec.md 25/34)', () => {
  it('marks the project completed_with_errors (not failed) when Scene Generation exhausts retries for some blocks, and Resume can recover them', async () => {
    const project = projectService.create(
      { name: 'Scene failure', transcript: 'Qin Hong walked in. The door creaked shut.' },
      { maxCharacters: 100, fakeDurationSec: 3 }
    )

    const failingScene = vi.spyOn(vilaoService, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
      const content = request.messages[0].content
      if (content.startsWith('DETECT')) return { content: CHARACTER_JSON }
      if (content.startsWith('GENERATE_CHAR_PROMPT')) return { content: characterPromptJson() }
      throw new Error('Simulated Scene Generation failure')
    })

    await pipelineService.runProject(project.id, runtime())

    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.COMPLETED_WITH_ERRORS)
    expect(db.prepare("SELECT COUNT(*) as n FROM scene_prompts WHERE project_id = ? AND status = 'failed'").get(project.id)).toEqual({
      n: expect.any(Number)
    })

    failingScene.mockRestore()
    mockAllStepsSucceed(vilaoService)
    await pipelineService.runProject(project.id, runtime())

    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.COMPLETED)
  })
})

describe('PipelineService.listTasks', () => {
  it('returns 3 pending view-only tasks before any Run', () => {
    const project = projectService.create({ name: 'Fresh', transcript: 'Text.' })
    const tasks = pipelineService.listTasks(project.id)
    expect(tasks.map((t) => t.taskType)).toEqual([TaskType.SPLIT_SRT, TaskType.DETECT_CHARACTERS, TaskType.GENERATE_CHARACTER_PROMPTS])
    expect(tasks.every((t) => t.status === TaskStatus.PENDING)).toBe(true)
  })
})
