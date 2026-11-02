import { BrowserWindow } from 'electron'

// Sends an event to every open window — for main-initiated updates that have
// no originating IpcMainInvokeEvent to reply through (queue-triggered runs,
// LLM call logging). A no-op with zero windows open.
export function broadcast<T>(channel: string, payload: T): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}
