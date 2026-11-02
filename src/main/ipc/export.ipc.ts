import { ipcMain, shell } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getAppSettings } from '../appSettingsStore'
import type { MainServices } from '../container'

// spec.md 21/8.7 — the 3-file bundle is now written automatically by
// PipelineService when Run All completes (straight into
// AppSettings.lastExportFolder, "Default Export Folder" from Settings >
// General), not from a manual button here. This file just supports the
// Export tab's "Show in Finder": getFolderPath() tells the Renderer where
// that folder is (or would be) without touching disk, showInFinder() reveals it.
export function registerExportIpc({ exportService }: MainServices): void {

  ipcMain.handle(IpcChannels.export.getFolderPath, async (_event, projectId: string): Promise<string | null> => {
    const settings = getAppSettings()
    if (!settings.lastExportFolder) return null
    return exportService.resolveFolderPath(projectId, settings.lastExportFolder)
  })

  ipcMain.handle(IpcChannels.export.showInFinder, async (_event, folderPath: string): Promise<void> => {
    shell.showItemInFolder(folderPath)
  })
}
