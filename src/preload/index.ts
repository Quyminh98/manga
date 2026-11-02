import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppApi, QueueItem, ScenePromptGenerationProgress } from '@shared/ipc-types'
import type { PipelineTask } from '@shared/entities'

// contextIsolation: true, nodeIntegration: false (see src/main/index.ts webPreferences).
// This is the only bridge between Renderer and Main — Renderer never gets
// direct Node/Electron access, matching spec.md 4.2.

const appApi: AppApi = {
  projects: {
    create: (input) => ipcRenderer.invoke(IpcChannels.projects.create, input),
    open: (id) => ipcRenderer.invoke(IpcChannels.projects.open, id),
    get: (id) => ipcRenderer.invoke(IpcChannels.projects.get, id),
    list: () => ipcRenderer.invoke(IpcChannels.projects.list),
    rename: (id, name) => ipcRenderer.invoke(IpcChannels.projects.rename, id, name),
    delete: (id) => ipcRenderer.invoke(IpcChannels.projects.delete, id),
    showInFinder: (id) => ipcRenderer.invoke(IpcChannels.projects.showInFinder, id),
    updateTranscript: (id, transcript) => ipcRenderer.invoke(IpcChannels.projects.updateTranscript, id, transcript),
    loadTranscriptFile: () => ipcRenderer.invoke(IpcChannels.projects.loadTranscriptFile),
    updatePipelineSettings: (id, settings) => ipcRenderer.invoke(IpcChannels.projects.updatePipelineSettings, id, settings)
  },
  srt: {
    list: (projectId) => ipcRenderer.invoke(IpcChannels.srt.list, projectId),
    split: (projectId) => ipcRenderer.invoke(IpcChannels.srt.split, projectId)
  },
  characters: {
    list: (projectId) => ipcRenderer.invoke(IpcChannels.characters.list, projectId),
    listPrompts: (projectId) => ipcRenderer.invoke(IpcChannels.characters.listPrompts, projectId),
    detect: (projectId, options) => ipcRenderer.invoke(IpcChannels.characters.detect, projectId, options),
    generatePrompts: (projectId) => ipcRenderer.invoke(IpcChannels.characters.generatePrompts, projectId),
    retryPrompt: (projectId, characterId) => ipcRenderer.invoke(IpcChannels.characters.retryPrompt, projectId, characterId)
  },
  scenePrompts: {
    list: (projectId) => ipcRenderer.invoke(IpcChannels.scenePrompts.list, projectId),
    generate: (projectId) => ipcRenderer.invoke(IpcChannels.scenePrompts.generate, projectId),
    retry: (projectId, blockIndex) => ipcRenderer.invoke(IpcChannels.scenePrompts.retry, projectId, blockIndex),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: ScenePromptGenerationProgress): void => callback(progress)
      ipcRenderer.on(IpcChannels.scenePrompts.progressEvent, listener)
      return () => ipcRenderer.removeListener(IpcChannels.scenePrompts.progressEvent, listener)
    }
  },
  pipeline: {
    run: (projectId) => ipcRenderer.invoke(IpcChannels.pipeline.run, projectId),
    pause: (projectId) => ipcRenderer.invoke(IpcChannels.pipeline.pause, projectId),
    resume: (projectId) => ipcRenderer.invoke(IpcChannels.pipeline.resume, projectId),
    cancel: (projectId) => ipcRenderer.invoke(IpcChannels.pipeline.cancel, projectId),
    retryTask: (projectId, taskId) => ipcRenderer.invoke(IpcChannels.pipeline.retryTask, projectId, taskId),
    listTasks: (projectId) => ipcRenderer.invoke(IpcChannels.pipeline.listTasks, projectId),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, task: PipelineTask): void => callback(task)
      ipcRenderer.on(IpcChannels.pipeline.progressEvent, listener)
      return () => ipcRenderer.removeListener(IpcChannels.pipeline.progressEvent, listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settings.get),
    save: (settings) => ipcRenderer.invoke(IpcChannels.settings.save, settings),
    chooseExportFolder: () => ipcRenderer.invoke(IpcChannels.settings.chooseExportFolder)
  },
  llmCalls: {
    stats: (projectId) => ipcRenderer.invoke(IpcChannels.llmCalls.stats, projectId),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, projectId: string): void => callback(projectId)
      ipcRenderer.on(IpcChannels.llmCalls.changedEvent, listener)
      return () => ipcRenderer.removeListener(IpcChannels.llmCalls.changedEvent, listener)
    }
  },
  providers: {
    saveApiKey: (provider, apiKey) => ipcRenderer.invoke(IpcChannels.providers.saveApiKey, provider, apiKey),
    testConnection: (provider) => ipcRenderer.invoke(IpcChannels.providers.testConnection, provider),
    listModels: (provider) => ipcRenderer.invoke(IpcChannels.providers.listModels, provider),
    hasApiKey: (provider) => ipcRenderer.invoke(IpcChannels.providers.hasApiKey, provider),
    clearApiKey: (provider) => ipcRenderer.invoke(IpcChannels.providers.clearApiKey, provider)
  },
  export: {
    getFolderPath: (projectId) => ipcRenderer.invoke(IpcChannels.export.getFolderPath, projectId),
    showInFinder: (folderPath) => ipcRenderer.invoke(IpcChannels.export.showInFinder, folderPath)
  },
  queue: {
    add: (projectId) => ipcRenderer.invoke(IpcChannels.queue.add, projectId),
    remove: (projectId) => ipcRenderer.invoke(IpcChannels.queue.remove, projectId),
    list: () => ipcRenderer.invoke(IpcChannels.queue.list),
    onUpdate: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, items: QueueItem[]): void => callback(items)
      ipcRenderer.on(IpcChannels.queue.updateEvent, listener)
      return () => ipcRenderer.removeListener(IpcChannels.queue.updateEvent, listener)
    }
  },
  channels: {
    list: () => ipcRenderer.invoke(IpcChannels.channels.list),
    get: (id) => ipcRenderer.invoke(IpcChannels.channels.get, id),
    create: (input) => ipcRenderer.invoke(IpcChannels.channels.create, input),
    update: (id, input) => ipcRenderer.invoke(IpcChannels.channels.update, id, input),
    delete: (id) => ipcRenderer.invoke(IpcChannels.channels.delete, id)
  },
  activation: {
    getMachineId: () => ipcRenderer.invoke(IpcChannels.activation.getMachineId),
    getStatus: () => ipcRenderer.invoke(IpcChannels.activation.getStatus),
    activate: (code) => ipcRenderer.invoke(IpcChannels.activation.activate, code)
  }
}

contextBridge.exposeInMainWorld('appApi', appApi)
