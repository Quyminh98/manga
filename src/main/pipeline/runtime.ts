import { app } from 'electron'
import type { Channel, Project } from '@shared/entities'
import { getProviderLabel, parseModelRef } from '@shared/llmProviders'
import type { RunPromptSettings } from '@shared/validateRun'
import { getAppSettings, saveAppSettings } from '../appSettingsStore'
import type { LlmCallRecorder } from '../llm/llmCallRecorder'
import type { LlmClient } from '../llm/LlmClient'
import { createPipelineLlmClient } from '../llm/pipelineLlmClient'
import type { ChannelService } from '../services/ChannelService'
import type { PipelineRuntime } from '../services/PipelineService'
import type { ProjectService } from '../services/ProjectService'
import type { SecureStorageService } from '../services/SecureStorageService'

export interface RuntimeDeps {
  projectService: ProjectService
  channelService: ChannelService
  secureStorage: SecureStorageService
  onLlmCall: LlmCallRecorder
}

interface LlmSettings {
  model: string | null
  promptSettings: RunPromptSettings
}

// Phase 18 — model/prompts come from the project's *channel*, not global
// AppSettings. Phase 22 — a project with hasCharacters=false uses
// sceneGenerationPromptNoCharacters, picked once here so everything
// downstream just sees a single already-resolved sceneGeneration string.
function liveChannelSettings(project: Project | null, channel: Channel | null): LlmSettings {
  return {
    model: channel?.selectedModel ?? null,
    promptSettings: {
      characterDetection: channel?.characterDetectionPrompt ?? '',
      characterGeneration: channel?.characterGenerationPrompt ?? '',
      sceneGeneration: (project?.hasCharacters ? channel?.sceneGenerationPrompt : channel?.sceneGenerationPromptNoCharacters) ?? ''
    }
  }
}

// spec.md 32 — once the first Run has snapshotted the project, every later
// LLM call for it (Resume, Retry, manual triggers) uses that snapshot.
function snapshotSettings(project: Project): LlmSettings | null {
  if (project.characterDetectionPromptSnapshot === null || !project.selectedModelSnapshot) return null
  return {
    model: project.selectedModelSnapshot,
    promptSettings: {
      characterDetection: project.characterDetectionPromptSnapshot,
      characterGeneration: project.characterGenerationPromptSnapshot ?? '',
      sceneGeneration: project.sceneGenerationPromptSnapshot ?? ''
    }
  }
}

// Run All/Resume/Retry Failed and queued runs. Always resolves the *live*
// channel settings: validateProjectForRun checks live prompts (spec.md 38)
// and they become the snapshot on the first Run; PipelineService itself
// switches to the snapshot afterwards.
//
// Doesn't throw on a missing key/model — callers want validateProjectForRun
// to produce the friendly spec.md 38 message instead of a generic IPC
// rejection. The "first-ever run" Default Export Folder fallback adopts
// Documents and persists it, no dialog, since a queued run fires unattended.
export function resolvePipelineRuntime(deps: RuntimeDeps, projectId: string): PipelineRuntime {
  const settings = getAppSettings()
  const exportFolder = settings.lastExportFolder ?? app.getPath('documents')
  if (!settings.lastExportFolder) saveAppSettings({ lastExportFolder: exportFolder })

  const project = deps.projectService.get(projectId)
  const channel = project ? deps.channelService.get(project.channelId) : null
  const { model, promptSettings } = liveChannelSettings(project, channel)

  // Phase 25 — the key/client follow the provider of the channel's model
  // (bare id = Vilao). No model yet → fall back to the Vilao key;
  // validateProjectForRun reports the missing model.
  const { provider } = parseModelRef(model ?? '')
  const apiKey = deps.secureStorage.getApiKey(provider)

  return {
    llmClient: apiKey ? createPipelineLlmClient(apiKey, provider, deps.onLlmCall) : null,
    model,
    promptSettings,
    hasApiKey: !!apiKey,
    exportFolder
  }
}

export interface ManualLlmRuntime {
  llmClient: LlmClient
  model: string
  promptSettings: RunPromptSettings
}

// Single-step actions outside Run All (Retry a Character Prompt / Scene,
// Detect, Generate): the project's snapshot once it has one, otherwise the
// same live channel settings Run All would use. Throws with a user-facing
// message when the model or its provider's API key is missing.
export function resolveManualLlmRuntime(deps: RuntimeDeps, projectId: string): ManualLlmRuntime {
  const project = deps.projectService.get(projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)

  let settings = snapshotSettings(project)
  if (!settings) {
    const channel = deps.channelService.get(project.channelId)
    if (!channel) throw new Error(`Channel not found: ${project.channelId}`)
    settings = liveChannelSettings(project, channel)
  }
  if (!settings.model) throw new Error("Select a model for this project's channel first.")

  const { provider } = parseModelRef(settings.model)
  const apiKey = deps.secureStorage.getApiKey(provider)
  if (!apiKey) {
    throw new Error(`Configure and save a ${getProviderLabel(provider)} API key in Settings > API Keys first.`)
  }

  return {
    llmClient: createPipelineLlmClient(apiKey, provider, deps.onLlmCall),
    model: settings.model,
    promptSettings: settings.promptSettings
  }
}
