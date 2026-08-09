import type { Project } from './entities'
import { getMissingPlaceholders } from './prompts'

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
  project: Pick<Project, 'transcript' | 'maxCharacters'>,
  promptSettings: RunPromptSettings,
  hasApiKey: boolean,
  selectedModel: string | null
): string | null {
  if (!project.transcript.trim()) {
    return 'Add a transcript before running the pipeline.'
  }

  if (!hasApiKey) {
    return 'Configure and save a Vilao API key in Settings > Vilao API first.'
  }

  if (!selectedModel) {
    return 'Select a model in Settings > Vilao API first.'
  }

  if (!Number.isInteger(project.maxCharacters) || project.maxCharacters < 100 || project.maxCharacters > 2000) {
    return 'Maximum characters per SRT must be between 100 and 2000. Fix it in Settings > General.'
  }

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

  if (!promptSettings.sceneGeneration.trim()) {
    return 'Scene / Image Generation prompt is empty. Fix it in Settings > Prompts.'
  }
  const missingScene = getMissingPlaceholders('sceneGeneration', promptSettings.sceneGeneration)
  if (missingScene.length > 0) {
    return `Scene Prompt thiếu ${missingScene.join(', ')}. Vui lòng sửa Prompt Settings trước khi chạy.`
  }

  return null
}
