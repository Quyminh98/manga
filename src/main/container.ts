import type Database from 'better-sqlite3'
import { IpcChannels } from '@shared/ipc-channels'
import type { QueueItem } from '@shared/ipc-types'
import { broadcast } from './broadcast'
import { createLlmCallRecorder, type LlmCallRecorder } from './llm/llmCallRecorder'
import { resolvePipelineRuntime, type RuntimeDeps } from './pipeline/runtime'
import { ActivationService } from './services/ActivationService'
import { ChannelService } from './services/ChannelService'
import { CharacterService } from './services/CharacterService'
import { getDatabase } from './services/DatabaseService'
import { ExportService } from './services/ExportService'
import { LlmCallService } from './services/LlmCallService'
import { PipelineService } from './services/PipelineService'
import { ProjectService } from './services/ProjectService'
import { QueueService, type QueueListItem } from './services/QueueService'
import { ScenePromptService } from './services/ScenePromptService'
import { SecureStorageService } from './services/SecureStorageService'
import { SrtService } from './services/SrtService'

// Composition root — every main-process service is built exactly once here
// and handed to the IPC handlers (src/main/ipc/*.ipc.ts) as a parameter.
// PipelineService/QueueService in particular must be single instances: their
// in-memory "running"/queue state is what Pause/Cancel/Delete and the
// "already running" guard act on, for manual and queued runs alike.
export interface MainServices extends RuntimeDeps {
  db: Database.Database
  srtService: SrtService
  characterService: CharacterService
  scenePromptService: ScenePromptService
  exportService: ExportService
  llmCallService: LlmCallService
  activationService: ActivationService
  pipelineService: PipelineService
  queueService: QueueService
  onLlmCall: LlmCallRecorder
}

// QueueService only tracks projectId — enrich with the display name and drop
// any id whose project no longer exists (Delete also dequeues it; this is a
// defensive backstop).
export function enrichQueueItems(items: QueueListItem[], projectService: ProjectService): QueueItem[] {
  return items
    .map((item) => {
      const project = projectService.get(item.projectId)
      return project ? { projectId: item.projectId, projectName: project.name, status: item.status } : null
    })
    .filter((item): item is QueueItem => item !== null)
}

export function createMainServices(): MainServices {
  const db = getDatabase()
  const projectService = new ProjectService(db)
  const channelService = new ChannelService(db)
  const secureStorage = new SecureStorageService()
  const llmCallService = new LlmCallService(db)
  const onLlmCall = createLlmCallRecorder(llmCallService)
  const pipelineService = new PipelineService(db)
  const runtimeDeps: RuntimeDeps = { projectService, channelService, secureStorage, onLlmCall }

  // Broadcasts (not event.sender.send): a queue-triggered run has no
  // originating IPC event to reply through.
  const queueService = new QueueService(
    (projectId, onTaskUpdate) =>
      pipelineService.runProject(projectId, resolvePipelineRuntime(runtimeDeps, projectId), onTaskUpdate, (progress) =>
        broadcast(IpcChannels.scenePrompts.progressEvent, progress)
      ),
    {
      onQueueChange: (items) => broadcast(IpcChannels.queue.updateEvent, enrichQueueItems(items, projectService)),
      onTaskUpdate: (task) => broadcast(IpcChannels.pipeline.progressEvent, task)
    }
  )

  return {
    ...runtimeDeps,
    db,
    srtService: new SrtService(db),
    characterService: new CharacterService(db),
    scenePromptService: new ScenePromptService(db),
    exportService: new ExportService(db),
    llmCallService,
    activationService: new ActivationService(),
    pipelineService,
    queueService
  }
}
