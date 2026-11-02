import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { PipelineTask } from '@shared/entities'
import type { MainServices } from '../container'
import { resolvePipelineRuntime } from '../pipeline/runtime'

// spec.md 36/37/19 — Run All orchestration + Pause/Resume/Cancel/Retry Failed,
// on top of PipelineService (which wraps the services built in Phase 5-8).
// It's the same shared instance queue.ipc.ts uses, so a project queued but
// not yet started and one run manually here agree on what's "already running".
export function registerPipelineIpc(services: MainServices): void {
  const { pipelineService } = services

  async function run(event: Electron.IpcMainInvokeEvent, projectId: string): Promise<void> {
    await pipelineService.runProject(
      projectId,
      resolvePipelineRuntime(services, projectId),
      (task) => event.sender.send(IpcChannels.pipeline.progressEvent, task),
      // Live Scene Generation progress for the Processing/Overview tabs.
      (progress) => event.sender.send(IpcChannels.scenePrompts.progressEvent, progress)
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
