import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { Channel } from '@shared/entities'
import type { MainServices } from '../container'
import type { ChannelInput } from '../services/ChannelService'
import type { ChannelWithProjectCount } from '../db/queries/channels.queries'

// Channels are a top-level entity, not a project sub-resource (unlike
// srt/characters/scenePrompts, which live inside projects.ipc.ts) — a
// dedicated domain file, same as providers.ipc.ts/export.ipc.ts/queue.ipc.ts.
export function registerChannelsIpc({ channelService }: MainServices): void {

  ipcMain.handle(IpcChannels.channels.list, async (): Promise<ChannelWithProjectCount[]> => {
    return channelService.list()
  })

  ipcMain.handle(IpcChannels.channels.get, async (_event, id: string): Promise<Channel | null> => {
    return channelService.get(id)
  })

  ipcMain.handle(IpcChannels.channels.create, async (_event, input: ChannelInput): Promise<Channel> => {
    return channelService.create(input)
  })

  ipcMain.handle(IpcChannels.channels.update, async (_event, id: string, input: ChannelInput): Promise<Channel> => {
    return channelService.update(id, input)
  })

  ipcMain.handle(IpcChannels.channels.delete, async (_event, id: string): Promise<void> => {
    channelService.delete(id)
  })
}
