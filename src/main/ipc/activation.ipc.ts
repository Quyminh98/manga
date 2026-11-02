import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ActivationResult, ActivationStatus } from '@shared/ipc-types'
import type { MainServices } from '../container'

export function registerActivationIpc({ activationService }: MainServices): void {

  ipcMain.handle(IpcChannels.activation.getMachineId, async (): Promise<string> => {
    return activationService.getMachineId()
  })

  ipcMain.handle(IpcChannels.activation.getStatus, async (): Promise<ActivationStatus> => {
    return activationService.getStatus()
  })

  ipcMain.handle(IpcChannels.activation.activate, async (_event, code: string): Promise<ActivationResult> => {
    return activationService.activate(code)
  })
}
