import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'
import {
  formatCharacterListFile,
  formatCharacterPromptsFile,
  formatImagePromptsFile,
  formatSrtFile,
  sanitizeFolderName
} from '@shared/exportFormat'
import { findProjectById } from '../db/queries/projects.queries'
import { findChannelById } from '../db/queries/channels.queries'
import { listSrtBlocksByProjectId } from '../db/queries/srtBlocks.queries'
import { listCharactersByProjectId } from '../db/queries/characters.queries'
import { listCharacterPromptsByProjectId } from '../db/queries/characterPrompts.queries'
import { listScenePromptsByProjectId } from '../db/queries/scenePrompts.queries'

// No electron import — takes a Database instance, same convention as
// ProjectService/SrtService (unit-testable via createDatabase(':memory:')).
// fs itself isn't Electron, so writing the 3 files here (rather than only
// building strings and pushing the write up to the IPC handler) stays
// consistent with that testability goal — a real temp dir works fine in vitest.
export class ExportService {
  constructor(private readonly db: Database.Database) {}

  // Phase 20 (user request) — output nests under a channel-name folder too,
  // so projects from different channels never collide/interleave in the
  // Default Export Folder: "{targetParentDir}/{Channel_Name}/{Project_Name}/".
  // Reads the channel's *current* name (not a snapshot) — same as the
  // project name itself, which was never snapshotted either — so renaming a
  // channel later moves where its projects export to on the next Run.
  private resolveFolderNames(projectId: string): { channelFolderName: string; projectFolderName: string } {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const channel = findChannelById(this.db, project.channelId)
    return {
      channelFolderName: sanitizeFolderName(channel?.name ?? '', 'Untitled_Channel'),
      projectFolderName: sanitizeFolderName(project.name, 'Untitled_Project')
    }
  }

  // Where export() would write, without touching disk — used to show/reveal
  // the folder (Export tab, "Show in Finder") without re-running a write.
  resolveFolderPath(projectId: string, targetParentDir: string): string {
    const { channelFolderName, projectFolderName } = this.resolveFolderNames(projectId)
    return join(targetParentDir, channelFolderName, projectFolderName)
  }

  // spec.md 21 — writes `${targetParentDir}/${Channel_Name}/${Project_Name}/`
  // containing Project_Name.srt, character_prompts.txt, image_prompts.txt,
  // and (Phase 24, only when the project has characters) character_list.txt.
  // Returns the created folder's absolute path.
  export(projectId: string, targetParentDir: string): { folderPath: string } {
    const { channelFolderName, projectFolderName } = this.resolveFolderNames(projectId)

    const srtBlocks = listSrtBlocksByProjectId(this.db, projectId)
    const characters = listCharactersByProjectId(this.db, projectId)
    const characterPrompts = listCharacterPromptsByProjectId(this.db, projectId)
    const scenePrompts = listScenePromptsByProjectId(this.db, projectId)

    const folderPath = join(targetParentDir, channelFolderName, projectFolderName)
    mkdirSync(folderPath, { recursive: true })

    writeFileSync(join(folderPath, `${projectFolderName}.srt`), formatSrtFile(srtBlocks), 'utf-8')
    writeFileSync(join(folderPath, 'character_prompts.txt'), formatCharacterPromptsFile(characters, characterPrompts), 'utf-8')
    writeFileSync(join(folderPath, 'image_prompts.txt'), formatImagePromptsFile(scenePrompts), 'utf-8')
    // Phase 24 (user request) — only for projects that actually have
    // characters (e.g. not a "No Characters" channel project, spec.md 6.5/17)
    // rather than always writing an empty file like the two above do.
    if (characters.length > 0) {
      writeFileSync(join(folderPath, 'character_list.txt'), formatCharacterListFile(characters), 'utf-8')
    }

    return { folderPath }
  }
}
