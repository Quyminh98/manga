import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { ErrorCode } from '@shared/enums'
import { formatStoredError } from '@shared/errorCode'
import { getAppSettings, saveAppSettings } from '../appSettingsStore'
import { getDatabase } from '../services/DatabaseService'
import { ExportService } from '../services/ExportService'

// spec.md 21/8.7 — Export tab's "Export Project" button. Main owns the
// native folder picker (same 3-layer rule as projects.loadTranscriptFile),
// writes the 3-file bundle via ExportService, and remembers the chosen
// parent folder as AppSettings.lastExportFolder for the next export.
export function registerExportIpc(): void {
  const exportService = new ExportService(getDatabase())

  ipcMain.handle(IpcChannels.export.project, async (event, projectId: string): Promise<{ folderPath: string }> => {
    const settings = getAppSettings()
    const options: Electron.OpenDialogOptions = {
      title: 'Choose export destination',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settings.lastExportFolder ?? app.getPath('documents')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('EXPORT_CANCELED')
    }

    const targetParentDir = result.filePaths[0]
    let folderPath: string
    try {
      folderPath = exportService.export(projectId, targetParentDir).folderPath
    } catch (err) {
      // spec.md 34 — EXPORT_ERROR, the one error code not already produced
      // by classifyError (ExportService never touches VilaoService).
      const message = err instanceof Error ? err.message : 'Export failed.'
      throw new Error(formatStoredError(ErrorCode.EXPORT_ERROR, message))
    }
    saveAppSettings({ lastExportFolder: targetParentDir })
    return { folderPath }
  })

  ipcMain.handle(IpcChannels.export.showInFinder, async (_event, folderPath: string): Promise<void> => {
    shell.showItemInFolder(folderPath)
  })
}
