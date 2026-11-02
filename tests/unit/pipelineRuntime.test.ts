import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/documents') } }))
vi.mock('../../src/main/appSettingsStore', () => ({
  getAppSettings: () => ({ lastExportFolder: '/exports' }),
  saveAppSettings: vi.fn()
}))

import { createDatabase } from '../../src/main/db/client'
import { resolveManualLlmRuntime, resolvePipelineRuntime, type RuntimeDeps } from '../../src/main/pipeline/runtime'
import { ChannelService, type ChannelInput } from '../../src/main/services/ChannelService'
import { ProjectService } from '../../src/main/services/ProjectService'
import type { SecureStorageService } from '../../src/main/services/SecureStorageService'
import { LlmProvider } from '../../src/shared/llmProviders'
import {
  DEFAULT_CHARACTER_DETECTION_PROMPT,
  DEFAULT_CHARACTER_GENERATION_PROMPT,
  DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT,
  DEFAULT_SCENE_GENERATION_PROMPT
} from '../../src/shared/prompts'

const CHANNEL_INPUT: ChannelInput = {
  name: 'Channel',
  avgCharacters: 300,
  variancePercent: 20,
  fakeDurationSec: 3,
  selectedModel: 'deepseek:deepseek-chat',
  characterDetectionPrompt: DEFAULT_CHARACTER_DETECTION_PROMPT,
  characterGenerationPrompt: DEFAULT_CHARACTER_GENERATION_PROMPT,
  sceneGenerationPrompt: DEFAULT_SCENE_GENERATION_PROMPT,
  sceneGenerationPromptNoCharacters: DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT,
  sceneConcurrency: 4,
  sceneBatchSize: 10,
  hasCharacters: true
}

let db: Database.Database
let projectService: ProjectService
let channelService: ChannelService
let apiKeys: Partial<Record<LlmProvider, string>>
let deps: RuntimeDeps

beforeEach(() => {
  db = createDatabase(':memory:')
  projectService = new ProjectService(db)
  channelService = new ChannelService(db)
  apiKeys = { [LlmProvider.DEEPSEEK]: 'ds-key', [LlmProvider.GEMINI]: 'gm-key' }
  const secureStorage = { getApiKey: (provider: LlmProvider) => apiKeys[provider] ?? null } as unknown as SecureStorageService
  deps = { projectService, channelService, secureStorage, onLlmCall: vi.fn() }
})

function createProject(channelOverrides: Partial<ChannelInput> = {}) {
  const channel = channelService.create({ ...CHANNEL_INPUT, ...channelOverrides })
  return projectService.create(
    { name: 'Project', transcript: 'Hello world.', channelId: channel.id },
    { hasCharacters: channel.hasCharacters }
  )
}

function snapshot(projectId: string, model: string, sceneGeneration: string) {
  projectService.applyFirstRunSnapshotIfMissing(projectId, {
    characterDetection: 'DETECT snapshot',
    characterGeneration: 'GENERATE snapshot',
    sceneGeneration,
    model,
    avgCharacters: 300,
    fakeDurationSec: 3
  })
}

describe('resolvePipelineRuntime', () => {
  it('uses the No Characters scene prompt for a hasCharacters=false project', () => {
    const project = createProject({ hasCharacters: false })
    const runtime = resolvePipelineRuntime(deps, project.id)
    expect(runtime.promptSettings.sceneGeneration).toBe(DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT)
    expect(runtime.model).toBe('deepseek:deepseek-chat')
    expect(runtime.hasApiKey).toBe(true)
    expect(runtime.exportFolder).toBe('/exports')
  })

  it('reports a missing API key instead of throwing', () => {
    delete apiKeys[LlmProvider.DEEPSEEK]
    const runtime = resolvePipelineRuntime(deps, createProject().id)
    expect(runtime.hasApiKey).toBe(false)
    expect(runtime.llmClient).toBeNull()
  })
})

describe('resolveManualLlmRuntime', () => {
  it('uses live channel settings before the first Run, picking the No Characters scene prompt', () => {
    const withChars = resolveManualLlmRuntime(deps, createProject().id)
    expect(withChars.promptSettings.sceneGeneration).toBe(DEFAULT_SCENE_GENERATION_PROMPT)

    const noChars = resolveManualLlmRuntime(deps, createProject({ hasCharacters: false }).id)
    expect(noChars.promptSettings.sceneGeneration).toBe(DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT)
  })

  it('uses the project snapshot (prompts + model) once the project has run, ignoring later channel edits', () => {
    const project = createProject()
    snapshot(project.id, 'gemini:gemini-2.5-flash', 'SCENE snapshot')
    channelService.update(project.channelId, { ...CHANNEL_INPUT, sceneGenerationPrompt: `${DEFAULT_SCENE_GENERATION_PROMPT}\nedited` })

    const runtime = resolveManualLlmRuntime(deps, project.id)
    expect(runtime.model).toBe('gemini:gemini-2.5-flash')
    expect(runtime.promptSettings).toEqual({
      characterDetection: 'DETECT snapshot',
      characterGeneration: 'GENERATE snapshot',
      sceneGeneration: 'SCENE snapshot'
    })
  })

  it("takes the API key from the snapshot model's provider", () => {
    const project = createProject()
    snapshot(project.id, 'gemini:gemini-2.5-flash', 'SCENE snapshot')
    delete apiKeys[LlmProvider.GEMINI]
    expect(() => resolveManualLlmRuntime(deps, project.id)).toThrow(/Gemini API key/)
  })

  it('throws a user-facing error when the channel has no model', () => {
    const project = createProject({ selectedModel: null })
    expect(() => resolveManualLlmRuntime(deps, project.id)).toThrow("Select a model for this project's channel first.")
  })

  it('throws for an unknown project', () => {
    expect(() => resolveManualLlmRuntime(deps, 'missing')).toThrow('Project not found: missing')
  })
})
