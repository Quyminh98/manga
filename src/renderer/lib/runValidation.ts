import { appApi } from '@renderer/lib/appApi'
import { parseModelRef } from '@shared/llmProviders'
import type { Project } from '@shared/entities'
import { validateProjectForRun } from '@shared/validateRun'

// Run All pre-flight for the TopBar/Processing tab. Phase 25: the model comes
// from the project's snapshot (once it has run) or its channel — not the old
// global AppSettings.selectedModel — and the API key checked is the one for
// that model's provider (Vilao/DeepSeek/Gemini).
export async function getRunBlockedReason(project: Project): Promise<string | undefined> {
  const [settings, channel] = await Promise.all([appApi.settings.get(), appApi.channels.get(project.channelId)])
  const model = project.selectedModelSnapshot ?? channel?.selectedModel ?? null
  const hasApiKey = await appApi.providers.hasApiKey(parseModelRef(model ?? '').provider)
  return validateProjectForRun(project, settings.promptSettings, hasApiKey, model) ?? undefined
}
