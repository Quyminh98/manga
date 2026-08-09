import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppApi, ScenePromptGenerationProgress } from '@shared/ipc-types'
import type { PipelineTask } from '@shared/entities'

// contextIsolation: true, nodeIntegration: false (see src/main/index.ts webPreferences).
// This is the only bridge between Renderer and Main — Renderer never gets
// direct Node/Electron access, matching spec.md 4.2.

const appApi: AppApi = {
  projects: {
    create: (input) => ipcRenderer.invoke(IpcChannels.projects.create, input),
    open: (id) => ipcRenderer.invoke(IpcChannels.projects.open, id),
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
    save: (settings) => ipcRenderer.invoke(IpcChannels.settings.save, settings)
  },
  vilao: {
    saveApiKey: (apiKey) => ipcRenderer.invoke(IpcChannels.vilao.saveApiKey, apiKey),
    testConnection: () => ipcRenderer.invoke(IpcChannels.vilao.testConnection),
    listModels: () => ipcRenderer.invoke(IpcChannels.vilao.listModels),
    hasApiKey: () => ipcRenderer.invoke(IpcChannels.vilao.hasApiKey),
    clearApiKey: () => ipcRenderer.invoke(IpcChannels.vilao.clearApiKey)
  },
  export: {
    project: (projectId) => ipcRenderer.invoke(IpcChannels.export.project, projectId),
    showInFinder: (folderPath) => ipcRenderer.invoke(IpcChannels.export.showInFinder, folderPath)
  }
}

contextBridge.exposeInMainWorld('appApi', appApi)
