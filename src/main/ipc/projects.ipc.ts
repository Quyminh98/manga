import { readFileSync } from 'fs'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { Character, CharacterPrompt, Project, ScenePrompt, SrtBlock } from '@shared/entities'
import type { LlmCallStats, ProjectSummary } from '@shared/ipc-types'
import type { MainServices } from '../container'
import { resolveManualLlmRuntime, type ManualLlmRuntime } from '../pipeline/runtime'
import { getDatabasePath } from '../services/DatabaseService'

// SRT / Characters / Scene Prompts are sub-resources of a project — kept in
// this file rather than new domain files (see spec.md 4.2).
export function registerProjectsIpc(services: MainServices): void {
  const {
    projectService,
    channelService,
    srtService,
    characterService,
    scenePromptService,
    llmCallService,
    pipelineService,
    queueService
  } = services

  ipcMain.handle(IpcChannels.llmCalls.stats, async (_event, projectId: string): Promise<LlmCallStats> => {
    return llmCallService.getStats(projectId)
  })

  ipcMain.handle(
    IpcChannels.projects.create,
    async (_event, input: { name: string; transcript: string; channelId: string }): Promise<Project> => {
      // Phase 18: new projects pick up their chosen channel's current
      // settings (avgCharacters/variancePercent/fakeDurationSec/
      // sceneConcurrency/sceneBatchSize) instead of global AppSettings —
      // AppSettings now only serves as the default template for a newly
      // created *channel* (NewChannelPage.tsx), not for a project directly.
      const channel = channelService.get(input.channelId)
      if (!channel) throw new Error(`Channel not found: ${input.channelId}`)
      return projectService.create(input, {
        avgCharacters: channel.avgCharacters,
        variancePercent: channel.variancePercent,
        fakeDurationSec: channel.fakeDurationSec,
        sceneConcurrency: channel.sceneConcurrency,
        sceneBatchSize: channel.sceneBatchSize,
        hasCharacters: channel.hasCharacters
      })
    }
  )

  ipcMain.handle(IpcChannels.projects.open, async (_event, id: string): Promise<Project | null> => {
    return projectService.open(id, pipelineService.isRunning(id))
  })

  ipcMain.handle(IpcChannels.projects.get, async (_event, id: string): Promise<Project | null> => {
    return projectService.get(id)
  })

  ipcMain.handle(IpcChannels.projects.list, async (): Promise<ProjectSummary[]> => {
    return projectService.list()
  })

  ipcMain.handle(IpcChannels.projects.rename, async (_event, id: string, name: string): Promise<void> => {
    projectService.rename(id, name)
  })

  // Delete works even mid-run (TopBar/ProcessingPage's Delete button while
  // processing): stopAndWait() requests a stop and waits for the in-flight
  // run() to actually settle first, so the DB delete below never races an
  // in-flight write that references this project (would violate a foreign
  // key). Dequeuing (if it was only queued, not yet started) is a no-op
  // otherwise — either way, QueueService.drain()'s own while-loop moves on
  // to the next project by itself once this run settles.
  ipcMain.handle(IpcChannels.projects.delete, async (_event, id: string): Promise<void> => {
    await pipelineService.stopAndWait(id)
    queueService.remove(id)
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
    async (_event, id: string, settings: { maxRetry: number; sceneConcurrency: number; sceneBatchSize: number }): Promise<Project> => {
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
    // Re-splitting replaces every block (and cascades their scene prompts) —
    // never while a run or another manual action is writing to them.
    return pipelineService.runExclusive(projectId, async () => srtService.split(projectId))
  })

  ipcMain.handle(IpcChannels.characters.list, async (_event, projectId: string): Promise<Character[]> => {
    return characterService.list(projectId)
  })

  // Manual single-step LLM actions: settings from resolveManualLlmRuntime
  // (snapshot once the project has run, else the channel's live settings —
  // spec.md 32), run through pipelineService.runExclusive so they never
  // overlap Run All for the same project.
  function runManual<T>(projectId: string, fn: (runtime: ManualLlmRuntime) => Promise<T>): Promise<T> {
    return pipelineService.runExclusive(projectId, () => fn(resolveManualLlmRuntime(services, projectId)))
  }

  ipcMain.handle(
    IpcChannels.characters.detect,
    async (_event, projectId: string, options?: { clearScenePrompts?: boolean }): Promise<Character[]> => {
      return runManual(projectId, async ({ llmClient, model, promptSettings }) => {
        const characters = await characterService.detect(projectId, {
          llmClient,
          promptTemplate: promptSettings.characterDetection,
          model
        })

        // spec.md 20 — Regenerate "characters + all scene prompts".
        if (options?.clearScenePrompts) {
          scenePromptService.clearAll(projectId)
        }

        return characters
      })
    }
  )

  ipcMain.handle(IpcChannels.characters.listPrompts, async (_event, projectId: string): Promise<CharacterPrompt[]> => {
    return characterService.listPrompts(projectId)
  })

  ipcMain.handle(IpcChannels.characters.generatePrompts, async (_event, projectId: string): Promise<CharacterPrompt[]> => {
    return runManual(projectId, ({ llmClient, model, promptSettings }) =>
      characterService.generatePrompts(projectId, { llmClient, promptTemplate: promptSettings.characterGeneration, model })
    )
  })

  ipcMain.handle(
    IpcChannels.characters.retryPrompt,
    async (_event, projectId: string, characterId: string): Promise<CharacterPrompt> => {
      return runManual(projectId, ({ llmClient, model, promptSettings }) =>
        characterService.retryPrompt(projectId, characterId, { llmClient, promptTemplate: promptSettings.characterGeneration, model })
      )
    }
  )

  ipcMain.handle(IpcChannels.scenePrompts.list, async (_event, projectId: string): Promise<ScenePrompt[]> => {
    return scenePromptService.list(projectId)
  })

  ipcMain.handle(IpcChannels.scenePrompts.generate, async (event, projectId: string): Promise<ScenePrompt[]> => {
    return runManual(projectId, ({ llmClient, model, promptSettings }) =>
      scenePromptService.generate(projectId, { llmClient, promptTemplate: promptSettings.sceneGeneration, model }, (progress) =>
        event.sender.send(IpcChannels.scenePrompts.progressEvent, progress)
      )
    )
  })

  ipcMain.handle(
    IpcChannels.scenePrompts.retry,
    async (_event, projectId: string, blockIndex: number): Promise<ScenePrompt> => {
      return runManual(projectId, ({ llmClient, model, promptSettings }) =>
        scenePromptService.retry(projectId, blockIndex, { llmClient, promptTemplate: promptSettings.sceneGeneration, model })
      )
    }
  )
}
