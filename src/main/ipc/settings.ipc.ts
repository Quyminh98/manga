import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/ipc-types'
import { getAppSettings, saveAppSettings } from '../appSettingsStore'

export function registerSettingsIpc(): void {
  ipcMain.handle(IpcChannels.settings.get, async (): Promise<AppSettings> => {
    return getAppSettings()
  })

  ipcMain.handle(IpcChannels.settings.save, async (_event, settings: Partial<AppSettings>): Promise<AppSettings> => {
    return saveAppSettings(settings)
  })
}
