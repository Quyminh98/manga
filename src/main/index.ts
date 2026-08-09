import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerProjectsIpc } from './ipc/projects.ipc'
import { registerPipelineIpc } from './ipc/pipeline.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { registerVilaoIpc } from './ipc/vilao.ipc'
import { registerExportIpc } from './ipc/export.ipc'

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    // 768 (not 1024) so the window can actually be resized past Tailwind's
    // `lg` (1024px) breakpoint — the point where Sidebar/HomeSidebar collapse
    // into a drawer per DESIGN.md Layout & Spacing > Responsive Behavior.
    minWidth: 768,
    minHeight: 640,
    show: false,
    backgroundColor: '#0F172A',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  registerProjectsIpc()
  registerPipelineIpc()
  registerSettingsIpc()
  registerVilaoIpc()
  registerExportIpc()
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
