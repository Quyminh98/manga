import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/client'
import { ProjectService } from '../../src/main/services/ProjectService'
import { PipelineService, type PipelineRuntime } from '../../src/main/services/PipelineService'
import { LlmClient } from '../../src/main/llm/LlmClient'
import type { LlmChatMessage } from '../../src/main/llm/LlmClient'
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

function mockAllStepsSucceed(llmClient: LlmClient) {
  return vi.spyOn(llmClient, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
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
let llmClient: LlmClient
let exportDir: string

beforeEach(() => {
  db = createDatabase(':memory:')
  projectService = new ProjectService(db)
  pipelineService = new PipelineService(db)
  llmClient = new LlmClient({ apiKey: 'test' })
  exportDir = mkdtempSync(join(tmpdir(), 'storyprompt-pipeline-test-'))
})

afterEach(() => {
  rmSync(exportDir, { recursive: true, force: true })
})

function runtime(overrides: Partial<PipelineRuntime> = {}): PipelineRuntime {
  return { llmClient, model: 'gpt-4o', promptSettings: PROMPT_SETTINGS, hasApiKey: true, exportFolder: exportDir, ...overrides }
}

describe('PipelineService.runProject — validation (spec.md 38)', () => {
  it('rejects and makes no changes when no API key is configured', async () => {
    const project = projectService.create({ name: 'No key', transcript: 'Hello world.' })
    const chatSpy = vi.spyOn(llmClient, 'chat')

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
      { avgCharacters: 100, fakeDurationSec: 3 }
    )
    mockAllStepsSucceed(llmClient)

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

  // Bug fix (user report): Scene Generation never broadcast live progress
  // during Run All — only the 3 coarse pipeline_tasks steps did, so the
  // Processing tab only reflected finished scenes after the user left and
  // reopened the project. onSceneProgress (4th param) forwards straight into
  // ScenePromptService.generate()'s own per-batch callback.
  it('forwards live per-batch progress via onSceneProgress during Scene Generation', async () => {
    const project = projectService.create(
      { name: 'Scene progress test', transcript: 'Qin Hong walked in. The door creaked shut.' },
      { avgCharacters: 100, fakeDurationSec: 3 }
    )
    mockAllStepsSucceed(llmClient)

    const sceneProgressUpdates: Array<{ batchesCompleted: number; totalBatches: number }> = []
    await pipelineService.runProject(project.id, runtime(), undefined, (progress) => sceneProgressUpdates.push(progress))

    expect(sceneProgressUpdates.length).toBeGreaterThan(0)
    expect(sceneProgressUpdates[sceneProgressUpdates.length - 1].batchesCompleted).toBe(
      sceneProgressUpdates[sceneProgressUpdates.length - 1].totalBatches
    )
  })

  it('snapshots prompts/model/settings exactly once, on the first Run (spec.md 32)', async () => {
    const project = projectService.create({ name: 'Snapshot test', transcript: 'Qin Hong walked in.' })
    expect(project.characterDetectionPromptSnapshot).toBeNull()

    mockAllStepsSucceed(llmClient)
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

  // Phase 21 — a channel/project with hasCharacters=false (transcript with no
  // story characters) skips Character Detection/Character Prompt Generation
  // entirely: no chat() call for either step, both pipeline_tasks rows are
  // marked success with no real work, and Scene Generation still runs to
  // completion (ScenePromptService already tolerates 0 characters).
  it('skips Detect Characters/Character Prompts (no LLM call) for a hasCharacters=false project, and still completes Scene Generation', async () => {
    const project = projectService.create(
      { name: 'No characters', transcript: 'The wind blew across the empty field.' },
      { avgCharacters: 100, fakeDurationSec: 3, hasCharacters: false }
    )

    const chatSpy = vi.spyOn(llmClient, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
      const content = request.messages[0].content
      if (content.startsWith('SCENE')) return { content: sceneResponseFor(content) }
      throw new Error(`Unexpected prompt content for a hasCharacters=false project: ${content.slice(0, 30)}`)
    })

    await pipelineService.runProject(project.id, runtime())

    const finalProject = projectService.get(project.id)!
    expect(finalProject.status).toBe(ProjectStatus.COMPLETED)
    expect(chatSpy.mock.calls.every((c) => (c[0] as { messages: LlmChatMessage[] }).messages[0].content.startsWith('SCENE'))).toBe(true)

    const tasks = pipelineService.listTasks(project.id)
    expect(tasks.find((t) => t.taskType === TaskType.DETECT_CHARACTERS)?.status).toBe(TaskStatus.SUCCESS)
    expect(tasks.find((t) => t.taskType === TaskType.GENERATE_CHARACTER_PROMPTS)?.status).toBe(TaskStatus.SUCCESS)
    expect(db.prepare('SELECT COUNT(*) as n FROM characters WHERE project_id = ?').get(project.id)).toEqual({ n: 0 })
    expect(db.prepare("SELECT COUNT(*) as n FROM scene_prompts WHERE project_id = ? AND status = 'success'").get(project.id)).toEqual({
      n: expect.any(Number)
    })
  })

  it('rejects a second concurrent run for the same project', async () => {
    const project = projectService.create({ name: 'Concurrent', transcript: 'Qin Hong walked in.' })
    mockAllStepsSucceed(llmClient)

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
    const chatSpy = vi.spyOn(llmClient, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
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
    vi.spyOn(llmClient, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
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

  it('stopAndWait() (Delete-while-running) requests a stop and only resolves once the in-flight run has actually settled', async () => {
    const project = projectService.create({ name: 'Stop and wait', transcript: 'Qin Hong walked in.' })

    let chatCalled: (() => void) | undefined
    const chatCalledPromise = new Promise<void>((resolve) => {
      chatCalled = resolve
    })
    let releaseDetect: (() => void) | undefined
    const detectGate = new Promise<void>((resolve) => {
      releaseDetect = resolve
    })

    vi.spyOn(llmClient, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
      const content = request.messages[0].content
      if (content.startsWith('DETECT')) {
        chatCalled?.()
        await detectGate
        return { content: CHARACTER_JSON }
      }
      return { content: characterPromptJson() }
    })

    const runPromise = pipelineService.runProject(project.id, runtime())
    // Guaranteed DETECT's chat() call is in flight (not a tick-count guess).
    await chatCalledPromise

    const stopPromise = pipelineService.stopAndWait(project.id)
    releaseDetect?.()
    await stopPromise

    // If stopAndWait() resolved before the run actually settled, this would
    // still show a stale/in-flight state — exactly the race a Delete-while-
    // running IPC handler (projects.ipc.ts) must not hit before deleting.
    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.PAUSED)
    await runPromise
  })

  it('stopAndWait() on a project with nothing running is a no-op that resolves immediately', async () => {
    const project = projectService.create({ name: 'Idle stop', transcript: 'Text.' })
    await expect(pipelineService.stopAndWait(project.id)).resolves.toBeUndefined()
    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.DRAFT)
  })
})

describe('PipelineService.runProject — Scene failures do not fail the whole project (spec.md 25/34)', () => {
  it('marks the project completed_with_errors (not failed) when Scene Generation exhausts retries for some blocks, and Resume can recover them', async () => {
    const project = projectService.create(
      { name: 'Scene failure', transcript: 'Qin Hong walked in. The door creaked shut.' },
      { avgCharacters: 100, fakeDurationSec: 3 }
    )

    const failingScene = vi.spyOn(llmClient, 'chat').mockImplementation(async (request: { messages: LlmChatMessage[] }) => {
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
    mockAllStepsSucceed(llmClient)
    await pipelineService.runProject(project.id, runtime())

    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.COMPLETED)
  })
})

describe('PipelineService.runExclusive (manual actions, Phase 29)', () => {
  it('rejects a manual action while Run All is in flight for the same project', async () => {
    const project = projectService.create({ name: 'Busy', transcript: 'Qin Hong walked in.' })
    mockAllStepsSucceed(llmClient)

    const run = pipelineService.runProject(project.id, runtime())
    const action = vi.fn(async () => 'done')
    await expect(pipelineService.runExclusive(project.id, action)).rejects.toThrow(/running/i)
    expect(action).not.toHaveBeenCalled()
    await run
  })

  it('rejects Run All while a manual action is in flight, then allows it once the action settles', async () => {
    const project = projectService.create({ name: 'Manual', transcript: 'Qin Hong walked in.' })
    mockAllStepsSucceed(llmClient)

    let finish!: () => void
    const action = pipelineService.runExclusive(project.id, () => new Promise<void>((resolve) => (finish = resolve)))
    expect(pipelineService.isRunning(project.id)).toBe(true)
    await expect(pipelineService.runProject(project.id, runtime())).rejects.toThrow(/already running/i)

    finish()
    await action
    expect(pipelineService.isRunning(project.id)).toBe(false)
    await pipelineService.runProject(project.id, runtime())
    expect(projectService.get(project.id)!.status).toBe(ProjectStatus.COMPLETED)
  })

  it('releases the guard when the action throws, and stopAndWait() waits for an in-flight action', async () => {
    const project = projectService.create({ name: 'Throws', transcript: 'Text.' })
    await expect(
      pipelineService.runExclusive(project.id, async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(pipelineService.isRunning(project.id)).toBe(false)

    let finish!: () => void
    let settled = false
    const action = pipelineService.runExclusive(project.id, () => new Promise<void>((resolve) => (finish = resolve)))
    const stopped = pipelineService.stopAndWait(project.id).then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    finish()
    await action
    await stopped
    expect(settled).toBe(true)
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
