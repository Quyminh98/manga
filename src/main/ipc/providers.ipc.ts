import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ModelInfo } from '@shared/entities'
import { VilaoConnectionStatus } from '@shared/enums'
import { getProviderLabel, type LlmProvider } from '@shared/llmProviders'
import type { MainServices } from '../container'
import { LlmApiError, LlmClient } from '../llm/LlmClient'

export function registerProvidersIpc({ secureStorage }: MainServices): void {

  ipcMain.handle(IpcChannels.providers.saveApiKey, async (_event, provider: LlmProvider, apiKey: string): Promise<void> => {
    secureStorage.saveApiKey(apiKey, provider)
  })

  ipcMain.handle(IpcChannels.providers.testConnection, async (_event, provider: LlmProvider): Promise<VilaoConnectionStatus> => {
    const apiKey = secureStorage.getApiKey(provider)
    if (!apiKey) return VilaoConnectionStatus.NOT_CONFIGURED

    try {
      await new LlmClient({ apiKey, provider }).listModels()
      return VilaoConnectionStatus.CONNECTED
    } catch (err) {
      if (err instanceof LlmApiError && err.status === 401) return VilaoConnectionStatus.INVALID
      return VilaoConnectionStatus.ERROR
    }
  })

  ipcMain.handle(IpcChannels.providers.listModels, async (_event, provider: LlmProvider): Promise<ModelInfo[]> => {
    const apiKey = secureStorage.getApiKey(provider)
    if (!apiKey) throw new Error(`${getProviderLabel(provider)} API key is not configured`)
    return new LlmClient({ apiKey, provider }).listModels()
  })

  // Local file-existence check only (no decrypt, no network) — safe to call
  // on every mount to drive the "key already saved" placeholder in the UI.
  ipcMain.handle(IpcChannels.providers.hasApiKey, async (_event, provider: LlmProvider): Promise<boolean> => {
    return secureStorage.hasApiKey(provider)
  })

  ipcMain.handle(IpcChannels.providers.clearApiKey, async (_event, provider: LlmProvider): Promise<void> => {
    secureStorage.clear(provider)
  })
}
