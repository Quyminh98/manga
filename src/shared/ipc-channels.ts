// Single source of truth for ipcMain/ipcRenderer channel names, shared
// between src/main/ipc/*.ipc.ts (handlers) and src/preload/index.ts (bridge).

export const IpcChannels = {
  projects: {
    create: 'projects:create',
    open: 'projects:open',
    get: 'projects:get',
    list: 'projects:list',
    rename: 'projects:rename',
    delete: 'projects:delete',
    showInFinder: 'projects:showInFinder',
    updateTranscript: 'projects:updateTranscript',
    loadTranscriptFile: 'projects:loadTranscriptFile',
    updatePipelineSettings: 'projects:updatePipelineSettings'
  },
  srt: {
    list: 'srt:list',
    split: 'srt:split'
  },
  characters: {
    list: 'characters:list',
    listPrompts: 'characters:listPrompts',
    detect: 'characters:detect',
    generatePrompts: 'characters:generatePrompts',
    retryPrompt: 'characters:retryPrompt'
  },
  scenePrompts: {
    list: 'scenePrompts:list',
    generate: 'scenePrompts:generate',
    retry: 'scenePrompts:retry',
    progressEvent: 'scenePrompts:progressEvent'
  },
  pipeline: {
    run: 'pipeline:run',
    pause: 'pipeline:pause',
    resume: 'pipeline:resume',
    cancel: 'pipeline:cancel',
    retryTask: 'pipeline:retryTask',
    listTasks: 'pipeline:listTasks',
    progressEvent: 'pipeline:progressEvent'
  },
  settings: {
    get: 'settings:get',
    save: 'settings:save',
    chooseExportFolder: 'settings:chooseExportFolder'
  },
  llmCalls: {
    stats: 'llmCalls:stats',
    changedEvent: 'llmCalls:changedEvent'
  },
  providers: {
    saveApiKey: 'providers:saveApiKey',
    testConnection: 'providers:testConnection',
    listModels: 'providers:listModels',
    hasApiKey: 'providers:hasApiKey',
    clearApiKey: 'providers:clearApiKey'
  },
  export: {
    getFolderPath: 'export:getFolderPath',
    showInFinder: 'export:showInFinder'
  },
  queue: {
    add: 'queue:add',
    remove: 'queue:remove',
    list: 'queue:list',
    updateEvent: 'queue:updateEvent'
  },
  channels: {
    list: 'channels:list',
    get: 'channels:get',
    create: 'channels:create',
    update: 'channels:update',
    delete: 'channels:delete'
  },
  activation: {
    getMachineId: 'activation:getMachineId',
    getStatus: 'activation:getStatus',
    activate: 'activation:activate'
  }
} as const
