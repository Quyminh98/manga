import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { formatCharacterPromptsFile, formatImagePromptsFile, formatSrtFile, sanitizeProjectFolderName } from '@shared/exportFormat'
import { findProjectById } from '../db/queries/projects.queries'
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

  // spec.md 21 — writes `${targetParentDir}/${Project_Name}/` containing
  // Project_Name.srt, character_prompts.txt, image_prompts.txt. Returns the
  // created folder's absolute path.
  export(projectId: string, targetParentDir: string): { folderPath: string } {
    const project = findProjectById(this.db, projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const srtBlocks = listSrtBlocksByProjectId(this.db, projectId)
    const characters = listCharactersByProjectId(this.db, projectId)
    const characterPrompts = listCharacterPromptsByProjectId(this.db, projectId)
    const scenePrompts = listScenePromptsByProjectId(this.db, projectId)

    const folderName = sanitizeProjectFolderName(project.name)
    const folderPath = join(targetParentDir, folderName)
    mkdirSync(folderPath, { recursive: true })

    writeFileSync(join(folderPath, `${folderName}.srt`), formatSrtFile(srtBlocks), 'utf-8')
    writeFileSync(join(folderPath, 'character_prompts.txt'), formatCharacterPromptsFile(characters, characterPrompts), 'utf-8')
    writeFileSync(join(folderPath, 'image_prompts.txt'), formatImagePromptsFile(scenePrompts), 'utf-8')

    return { folderPath }
  }
}
