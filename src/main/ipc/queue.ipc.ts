import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { QueueItem } from '@shared/ipc-types'
import { enrichQueueItems, type MainServices } from '../container'

// "Run multiple projects one after another" — QueueService (built in
// container.ts) sequences runs on the exact same PipelineService instance
// pipeline.ipc.ts uses, so Pause/Cancel/Delete and the "already running"
// guard behave identically whether a run was started manually or by the
// queue reaching it.
export function registerQueueIpc({ queueService, projectService }: MainServices): void {
  ipcMain.handle(IpcChannels.queue.add, async (_event, projectId: string): Promise<void> => {
    queueService.add(projectId)
  })

  ipcMain.handle(IpcChannels.queue.remove, async (_event, projectId: string): Promise<void> => {
    queueService.remove(projectId)
  })

  ipcMain.handle(IpcChannels.queue.list, async (): Promise<QueueItem[]> => {
    return enrichQueueItems(queueService.list(), projectService)
  })
}
