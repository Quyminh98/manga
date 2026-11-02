import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase } from '../../src/main/db/client'
import { LlmCallService } from '../../src/main/services/LlmCallService'
import { ProjectService } from '../../src/main/services/ProjectService'
import { LlmClient, type LlmCallRecord } from '../../src/main/llm/LlmClient'
import { TaskType } from '../../src/shared/enums'

let db: Database.Database
let service: LlmCallService
let projectService: ProjectService

beforeEach(() => {
  db = createDatabase(':memory:')
  service = new LlmCallService(db)
  projectService = new ProjectService(db)
})

function record(projectId: string, overrides: Partial<LlmCallRecord> = {}): LlmCallRecord {
  return {
    projectId,
    step: TaskType.GENERATE_SCENE_PROMPT,
    model: 'gpt-4o',
    status: 'success',
    error: null,
    durationMs: 1000,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    ...overrides
  }
}

describe('LlmCallService', () => {
  it('returns zeroed stats for a project with no calls', () => {
    const project = projectService.create({ name: 'Empty', transcript: 't' })
    const stats = service.getStats(project.id)
    expect(stats).toMatchObject({ totalCalls: 0, successCalls: 0, failedCalls: 0, totalTokens: 0, byStep: [], byModel: [], recent: [] })
  })

  it('counts every call, splits success/failed, and groups by step and model', () => {
    const project = projectService.create({ name: 'P', transcript: 't' })
    service.record(record(project.id))
    service.record(record(project.id))
    service.record(record(project.id, { status: 'failed', error: 'HTTP 429: slow down', usage: null, durationMs: 500 }))
    service.record(record(project.id, { step: TaskType.DETECT_CHARACTERS, model: 'deepseek:deepseek-flash@high', usage: null }))

    const stats = service.getStats(project.id)
    expect(stats.totalCalls).toBe(4)
    expect(stats.successCalls).toBe(3)
    expect(stats.failedCalls).toBe(1)
    expect(stats.totalDurationMs).toBe(3500)
    expect(stats.promptTokens).toBe(200)
    expect(stats.totalTokens).toBe(300)

    const scene = stats.byStep.find((g) => g.key === TaskType.GENERATE_SCENE_PROMPT)
    expect(scene).toMatchObject({ calls: 3, failed: 1 })
    expect(stats.byModel.map((g) => g.key).sort()).toEqual(['deepseek:deepseek-flash@high', 'gpt-4o'])
    expect(stats.recent).toHaveLength(4)
    expect(stats.recent[0].step).toBe(TaskType.DETECT_CHARACTERS) // newest first
    expect(stats.recent.find((c) => c.status === 'failed')?.error).toBe('HTTP 429: slow down')
  })

  it("only counts the given project's calls", () => {
    const a = projectService.create({ name: 'A', transcript: 't' })
    const b = projectService.create({ name: 'B', transcript: 't' })
    service.record(record(a.id))
    service.record(record(b.id))
    service.record(record(b.id))
    expect(service.getStats(a.id).totalCalls).toBe(1)
    expect(service.getStats(b.id).totalCalls).toBe(2)
  })

  it('deletes with the project (cascade)', () => {
    const project = projectService.create({ name: 'Gone', transcript: 't' })
    service.record(record(project.id))
    projectService.delete(project.id)
    const left = db.prepare('SELECT COUNT(*) AS n FROM llm_calls').get() as { n: number }
    expect(left.n).toBe(0)
  })

  it('never throws, e.g. for a project that no longer exists', () => {
    expect(() => service.record(record('missing-project'))).not.toThrow()
  })
})

describe('LlmClient onCall logging', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const messages = [{ role: 'user' as const, content: 'x' }]

  it('reports a successful call with usage', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      )
    )
    const onCall = vi.fn()
    await new LlmClient({ apiKey: 'k', onCall }).chat({
      model: 'gpt-4o',
      messages,
      meta: { projectId: 'p1', step: TaskType.DETECT_CHARACTERS }
    })

    expect(onCall).toHaveBeenCalledTimes(1)
    expect(onCall.mock.calls[0][0]).toMatchObject({
      projectId: 'p1',
      step: TaskType.DETECT_CHARACTERS,
      model: 'gpt-4o',
      status: 'success',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    })
  })

  it('reports a failed call and still rethrows', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }))
    const onCall = vi.fn()
    await expect(
      new LlmClient({ apiKey: 'k', onCall }).chat({
        model: 'gpt-4o',
        messages,
        meta: { projectId: 'p1', step: TaskType.GENERATE_SCENE_PROMPT }
      })
    ).rejects.toThrow('rate limited')

    expect(onCall.mock.calls[0][0]).toMatchObject({ status: 'failed', error: 'HTTP 429: rate limited', usage: null })
  })

  it('does not log calls without meta, and a throwing logger does not break the call', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })))
    const onCall = vi.fn(() => {
      throw new Error('disk full')
    })
    const service = new LlmClient({ apiKey: 'k', onCall })

    await service.chat({ model: 'gpt-4o', messages })
    expect(onCall).not.toHaveBeenCalled()

    const res = await service.chat({ model: 'gpt-4o', messages, meta: { projectId: 'p', step: TaskType.DETECT_CHARACTERS } })
    expect(res.content).toBe('ok')
  })
})
