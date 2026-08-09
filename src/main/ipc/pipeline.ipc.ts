import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { PipelineTask } from '@shared/entities'
import { getAppSettings } from '../appSettingsStore'
import { getDatabase } from '../services/DatabaseService'
import { PipelineService, type PipelineRuntime } from '../services/PipelineService'
import { SecureStorageService } from '../services/SecureStorageService'
import { VilaoService } from '../services/VilaoService'

// spec.md 36/37/19 — Run All orchestration + Pause/Resume/Cancel/Retry Failed,
// on top of PipelineService (which wraps the services built in Phase 5-8).
export function registerPipelineIpc(): void {
  const pipelineService = new PipelineService(getDatabase())
  const secureStorage = new SecureStorageService()

  // Doesn't throw on a missing key/model — unlike the equivalent resolver in
  // projects.ipc.ts, pipeline.run wants validateProjectForRun to produce the
  // friendly spec.md 38 message instead of a generic IPC rejection.
  function resolveRuntime(): PipelineRuntime {
    const apiKey = secureStorage.getApiKey()
    const settings = getAppSettings()
    return {
      vilaoService: apiKey ? new VilaoService({ apiKey }) : null,
      model: settings.selectedModel,
      promptSettings: settings.promptSettings,
      hasApiKey: !!apiKey
    }
  }

  async function run(event: Electron.IpcMainInvokeEvent, projectId: string): Promise<void> {
    await pipelineService.runProject(projectId, resolveRuntime(), (task) =>
      event.sender.send(IpcChannels.pipeline.progressEvent, task)
    )
  }

  // run() and resume() are the same call — every step inside runProject() is
  // gated ("if not already done"), so re-invoking it is what Resume means
  // (spec.md 19.3: only failed/pending work actually runs again).
  ipcMain.handle(IpcChannels.pipeline.run, run)
  ipcMain.handle(IpcChannels.pipeline.resume, run)
  // Retry Failed (mục 8.6) — same gated re-run; there's no per-task partial
  // re-run because every step already only redoes failed/pending work.
  ipcMain.handle(IpcChannels.pipeline.retryTask, run)

  ipcMain.handle(IpcChannels.pipeline.pause, async (_event, projectId: string): Promise<void> => {
    pipelineService.pause(projectId)
  })

  ipcMain.handle(IpcChannels.pipeline.cancel, async (_event, projectId: string): Promise<void> => {
    pipelineService.cancel(projectId)
  })

  ipcMain.handle(IpcChannels.pipeline.listTasks, async (_event, projectId: string): Promise<PipelineTask[]> => {
    return pipelineService.listTasks(projectId)
  })
}
