import type { Project } from './entities'
import { getMissingPlaceholders } from './prompts'
import { getProviderLabel, parseModelRef } from './llmProviders'

// spec.md 38 — Validation trước Run. Lives in shared/ (not src/main/pipeline/)
// for the same reason as prompts.ts: both Main (PipelineService.runProject(),
// as the real gate) and Renderer (TopBar/Processing — disabling Run All with
// a matching tooltip before the user even clicks it) need the exact same
// check and message, and Renderer must never contain pipeline business logic
// per CLAUDE.md's 3-layer architecture, so this has to be framework/layer
// agnostic rather than living under src/main/. Returns the first violation
// found (spec.md 38's own example shows a single message, not a full list),
// in the order spec.md lists them.
export interface RunPromptSettings {
  characterDetection: string
  characterGeneration: string
  sceneGeneration: string
}

export function validateProjectForRun(
  project: Pick<Project, 'transcript' | 'avgCharacters' | 'hasCharacters'>,
  promptSettings: RunPromptSettings,
  hasApiKey: boolean,
  selectedModel: string | null
): string | null {
  if (!project.transcript.trim()) {
    return 'Add a transcript before running the pipeline.'
  }

  // Phase 25 — `hasApiKey` is about the provider of `selectedModel` (bare id =
  // Vilao), so the message names the right provider.
  if (!hasApiKey) {
    const provider = getProviderLabel(parseModelRef(selectedModel ?? '').provider)
    return `Configure and save a ${provider} API key in Settings > API Keys first.`
  }

  if (!selectedModel) {
    return "Select a model for this project's channel first."
  }

  if (!Number.isInteger(project.avgCharacters) || project.avgCharacters < 30 || project.avgCharacters > 2000) {
    return 'Average characters per SRT must be between 30 and 2000 (set via this project\'s channel).'
  }

  // Phase 21 — a "No Characters" project (project.hasCharacters=false) never
  // runs Character Detection/Character Prompt Generation (PipelineService),
  // so its prompts (still present on the channel, just unused/hidden in the
  // UI, see ChannelForm.tsx) don't need to be valid for a Run to proceed.
  if (project.hasCharacters) {
    if (!promptSettings.characterDetection.trim()) {
      return 'Character Detection prompt is empty. Fix it in Settings > Prompts.'
    }
    const missingDetection = getMissingPlaceholders('characterDetection', promptSettings.characterDetection)
    if (missingDetection.length > 0) {
      return `Character Detection prompt is missing ${missingDetection.join(', ')}. Fix it in Settings > Prompts before running.`
    }

    if (!promptSettings.characterGeneration.trim()) {
      return 'Character Generation prompt is empty. Fix it in Settings > Prompts.'
    }
    const missingGeneration = getMissingPlaceholders('characterGeneration', promptSettings.characterGeneration)
    if (missingGeneration.length > 0) {
      return `Character Generation prompt is missing ${missingGeneration.join(', ')}. Fix it in Settings > Prompts before running.`
    }
  }

  if (!promptSettings.sceneGeneration.trim()) {
    return 'Scene / Image Generation prompt is empty. Fix it in Settings > Prompts.'
  }
  // Phase 22 — resolvePipelineRuntime already picked the right template
  // (sceneGeneration vs sceneGenerationNoCharacters) into promptSettings.sceneGeneration
  // based on this same project.hasCharacters — check it against the matching
  // placeholder set (the "No Characters" template never has/needs
  // {{RELEVANT_CHARACTERS}}/{{RELEVANT_CHARACTER_PROMPTS}}).
  const missingScene = getMissingPlaceholders(
    project.hasCharacters ? 'sceneGeneration' : 'sceneGenerationNoCharacters',
    promptSettings.sceneGeneration
  )
  if (missingScene.length > 0) {
    return `Scene Prompt thiếu ${missingScene.join(', ')}. Vui lòng sửa Prompt Settings trước khi chạy.`
  }

  return null
}
