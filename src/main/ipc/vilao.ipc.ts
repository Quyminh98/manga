import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ModelInfo } from '@shared/entities'
import { VilaoConnectionStatus } from '@shared/enums'
import { SecureStorageService } from '../services/SecureStorageService'
import { VilaoApiError, VilaoService } from '../services/VilaoService'

export function registerVilaoIpc(): void {
  const secureStorage = new SecureStorageService()

  ipcMain.handle(IpcChannels.vilao.saveApiKey, async (_event, apiKey: string): Promise<void> => {
    secureStorage.saveApiKey(apiKey)
  })

  ipcMain.handle(IpcChannels.vilao.testConnection, async (): Promise<VilaoConnectionStatus> => {
    const apiKey = secureStorage.getApiKey()
    if (!apiKey) return VilaoConnectionStatus.NOT_CONFIGURED

    try {
      await new VilaoService({ apiKey }).listModels()
      return VilaoConnectionStatus.CONNECTED
    } catch (err) {
      if (err instanceof VilaoApiError && err.status === 401) return VilaoConnectionStatus.INVALID
      return VilaoConnectionStatus.ERROR
    }
  })

  ipcMain.handle(IpcChannels.vilao.listModels, async (): Promise<ModelInfo[]> => {
    const apiKey = secureStorage.getApiKey()
    if (!apiKey) throw new Error('Vilao API key is not configured')
    return new VilaoService({ apiKey }).listModels()
  })

  // Local file-existence check only (no decrypt, no network) — safe to call
  // on every mount to drive the "key already saved" placeholder in the UI.
  ipcMain.handle(IpcChannels.vilao.hasApiKey, async (): Promise<boolean> => {
    return secureStorage.hasApiKey()
  })

  ipcMain.handle(IpcChannels.vilao.clearApiKey, async (): Promise<void> => {
    secureStorage.clear()
  })
}
