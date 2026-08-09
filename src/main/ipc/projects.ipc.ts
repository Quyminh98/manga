import { readFileSync } from 'fs'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { Character, CharacterPrompt, Project, ScenePrompt, SrtBlock } from '@shared/entities'
import type { ProjectSummary } from '@shared/ipc-types'
import { getAppSettings } from '../appSettingsStore'
import { getDatabase, getDatabasePath } from '../services/DatabaseService'
import { CharacterService } from '../services/CharacterService'
import { ProjectService } from '../services/ProjectService'
import { ScenePromptService } from '../services/ScenePromptService'
import { SecureStorageService } from '../services/SecureStorageService'
import { SrtService } from '../services/SrtService'
import { VilaoService } from '../services/VilaoService'

// SRT / Characters / Scene Prompts are sub-resources of a project — kept in
// this file rather than new domain files (see spec.md 4.2). Real logic:
// SRT in Phase 5, Characters in Phase 6-7, Scene Prompts in Phase 8.

export function registerProjectsIpc(): void {
  const projectService = new ProjectService(getDatabase())
  const srtService = new SrtService(getDatabase())
  const characterService = new CharacterService(getDatabase())
  const scenePromptService = new ScenePromptService(getDatabase())
  const secureStorage = new SecureStorageService()

  ipcMain.handle(
    IpcChannels.projects.create,
    async (_event, input: { name: string; transcript: string }): Promise<Project> => {
      // plan.md Phase 4: new projects pick up the current General Settings
      // defaults (maxCharacters/fakeSrtDurationSec) instead of hard-coded ones.
      const settings = getAppSettings()
      return projectService.create(input, {
        maxCharacters: settings.maxCharacters,
        fakeDurationSec: settings.fakeSrtDurationSec
      })
    }
  )

  ipcMain.handle(IpcChannels.projects.open, async (_event, id: string): Promise<Project | null> => {
    return projectService.open(id)
  })

  ipcMain.handle(IpcChannels.projects.list, async (): Promise<ProjectSummary[]> => {
    return projectService.list()
  })

  ipcMain.handle(IpcChannels.projects.rename, async (_event, id: string, name: string): Promise<void> => {
    projectService.rename(id, name)
  })

  ipcMain.handle(IpcChannels.projects.delete, async (_event, id: string): Promise<void> => {
    projectService.delete(id)
  })

  // No per-project folder exists until Export (Phase 11) — reveals the
  // SQLite DB file itself, which also doubles as the manual "kiểm tra file
  // DB trong userData path" check in plan.md's Phase 2 test plan.
  ipcMain.handle(IpcChannels.projects.showInFinder, async (): Promise<void> => {
    shell.showItemInFolder(getDatabasePath())
  })

  ipcMain.handle(
    IpcChannels.projects.updateTranscript,
    async (_event, id: string, transcript: string): Promise<void> => {
      projectService.updateTranscript(id, transcript)
    }
  )

  ipcMain.handle(IpcChannels.projects.loadTranscriptFile, async (event): Promise<string | null> => {
    const options: Electron.OpenDialogOptions = {
      title: 'Load transcript',
      properties: ['openFile'],
      filters: [{ name: 'Text files', extensions: ['txt'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    if (result.canceled || result.filePaths.length === 0) return null
    return readFileSync(result.filePaths[0], 'utf-8')
  })

  ipcMain.handle(
    IpcChannels.projects.updatePipelineSettings,
    async (_event, id: string, settings: { maxRetry: number; sceneConcurrency: number }): Promise<Project> => {
      projectService.updatePipelineSettings(id, settings)
      const project = projectService.get(id)
      if (!project) throw new Error(`Project not found: ${id}`)
      return project
    }
  )

  ipcMain.handle(IpcChannels.srt.list, async (_event, projectId: string): Promise<SrtBlock[]> => {
    return srtService.list(projectId)
  })
  ipcMain.handle(IpcChannels.srt.split, async (_event, projectId: string): Promise<SrtBlock[]> => {
    return srtService.split(projectId)
  })

  ipcMain.handle(IpcChannels.characters.list, async (_event, projectId: string): Promise<Character[]> => {
    return characterService.list(projectId)
  })

  ipcMain.handle(
    IpcChannels.characters.detect,
    async (_event, projectId: string, options?: { clearScenePrompts?: boolean }): Promise<Character[]> => {
      const apiKey = secureStorage.getApiKey()
      if (!apiKey) throw new Error('Configure and save a Vilao API key in Settings > Vilao API first.')

      const settings = getAppSettings()
      if (!settings.selectedModel) throw new Error('Select a model in Settings > Vilao API first.')

      const vilaoService = new VilaoService({ apiKey })
      const characters = await characterService.detect(projectId, {
        vilaoService,
        promptTemplate: settings.promptSettings.characterDetection,
        model: settings.selectedModel
      })

      // spec.md 20 — Regenerate "characters + all scene prompts".
      if (options?.clearScenePrompts) {
        scenePromptService.clearAll(projectId)
      }

      return characters
    }
  )

  ipcMain.handle(IpcChannels.characters.listPrompts, async (_event, projectId: string): Promise<CharacterPrompt[]> => {
    return characterService.listPrompts(projectId)
  })

  ipcMain.handle(IpcChannels.characters.generatePrompts, async (_event, projectId: string): Promise<CharacterPrompt[]> => {
    const apiKey = secureStorage.getApiKey()
    if (!apiKey) throw new Error('Configure and save a Vilao API key in Settings > Vilao API first.')

    const settings = getAppSettings()
    if (!settings.selectedModel) throw new Error('Select a model in Settings > Vilao API first.')

    const vilaoService = new VilaoService({ apiKey })
    return characterService.generatePrompts(projectId, {
      vilaoService,
      promptTemplate: settings.promptSettings.characterGeneration,
      model: settings.selectedModel
    })
  })

  ipcMain.handle(
    IpcChannels.characters.retryPrompt,
    async (_event, projectId: string, characterId: string): Promise<CharacterPrompt> => {
      const apiKey = secureStorage.getApiKey()
      if (!apiKey) throw new Error('Configure and save a Vilao API key in Settings > Vilao API first.')

      const settings = getAppSettings()
      if (!settings.selectedModel) throw new Error('Select a model in Settings > Vilao API first.')

      const vilaoService = new VilaoService({ apiKey })
      return characterService.retryPrompt(projectId, characterId, {
        vilaoService,
        promptTemplate: settings.promptSettings.characterGeneration,
        model: settings.selectedModel
      })
    }
  )

  function resolveVilaoRuntime(): { vilaoService: VilaoService; model: string; promptSettings: ReturnType<typeof getAppSettings>['promptSettings'] } {
    const apiKey = secureStorage.getApiKey()
    if (!apiKey) throw new Error('Configure and save a Vilao API key in Settings > Vilao API first.')

    const settings = getAppSettings()
    if (!settings.selectedModel) throw new Error('Select a model in Settings > Vilao API first.')

    return { vilaoService: new VilaoService({ apiKey }), model: settings.selectedModel, promptSettings: settings.promptSettings }
  }

  ipcMain.handle(IpcChannels.scenePrompts.list, async (_event, projectId: string): Promise<ScenePrompt[]> => {
    return scenePromptService.list(projectId)
  })

  ipcMain.handle(IpcChannels.scenePrompts.generate, async (event, projectId: string): Promise<ScenePrompt[]> => {
    const { vilaoService, model, promptSettings } = resolveVilaoRuntime()
    return scenePromptService.generate(
      projectId,
      { vilaoService, promptTemplate: promptSettings.sceneGeneration, model },
      (progress) => event.sender.send(IpcChannels.scenePrompts.progressEvent, progress)
    )
  })

  ipcMain.handle(
    IpcChannels.scenePrompts.retry,
    async (_event, projectId: string, blockIndex: number): Promise<ScenePrompt> => {
      const { vilaoService, model, promptSettings } = resolveVilaoRuntime()
      return scenePromptService.retry(projectId, blockIndex, { vilaoService, promptTemplate: promptSettings.sceneGeneration, model })
    }
  )
}
