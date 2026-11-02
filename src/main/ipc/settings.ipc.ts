import { app, BrowserWindow, dialog, ipcMain } from 'electron'
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

  // Settings > General "Browse…" for Default Export Folder — same native
  // dialog export.project() falls back to on its first run (export.ipc.ts).
  ipcMain.handle(IpcChannels.settings.chooseExportFolder, async (event): Promise<string | null> => {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose default export folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getAppSettings().lastExportFolder ?? app.getPath('documents')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    saveAppSettings({ lastExportFolder: folder })
    return folder
  })
}
