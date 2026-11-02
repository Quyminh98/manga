import { randomUUID } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/db/client'
import { ProjectService } from '../../src/main/services/ProjectService'
import { ChannelService } from '../../src/main/services/ChannelService'
import { ExportService } from '../../src/main/services/ExportService'
import { insertSrtBlocks } from '../../src/main/db/queries/srtBlocks.queries'
import { insertCharacters } from '../../src/main/db/queries/characters.queries'
import { upsertCharacterPrompt } from '../../src/main/db/queries/characterPrompts.queries'
import { upsertScenePrompt } from '../../src/main/db/queries/scenePrompts.queries'
import type { Character, CharacterPrompt, ScenePrompt, SrtBlock } from '../../src/shared/entities'

let db: Database.Database
let projectService: ProjectService
let exportService: ExportService
let tmpDir: string

beforeEach(() => {
  db = createDatabase(':memory:')
  projectService = new ProjectService(db)
  exportService = new ExportService(db)
  tmpDir = mkdtempSync(join(tmpdir(), 'storyprompt-export-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('ExportService', () => {
  it('writes Project_Name/{Project_Name.srt, character_prompts.txt, image_prompts.txt} with matching content', () => {
    const project = projectService.create({ name: 'My Test Project', transcript: 'One. Two.' })
    const now = new Date().toISOString()

    const srtBlockId = randomUUID()
    const block: SrtBlock = {
      id: srtBlockId,
      projectId: project.id,
      blockIndex: 1,
      startMs: 0,
      endMs: 3000,
      text: 'Hello world.',
      characterCount: 12,
      createdAt: now
    }
    insertSrtBlocks(db, [block])

    const character: Character = {
      id: randomUUID(),
      projectId: project.id,
      characterId: '@Hero',
      name: 'Hero',
      gender: 'male',
      ageRange: 'adult',
      appearance: 'tall',
      hair: 'black',
      clothing: 'armor',
      personality: 'brave',
      role: 'protagonist',
      uniqueFeatures: 'scar',
      visualDna: 'core visual dna',
      createdAt: now,
      updatedAt: now
    }
    insertCharacters(db, [character])

    const characterPrompt: CharacterPrompt = {
      id: randomUUID(),
      projectId: project.id,
      characterId: '@Hero',
      prompt: 'Character design of @Hero, brave protagonist.',
      status: 'success',
      attempts: 1,
      error: null,
      updatedAt: now
    }
    upsertCharacterPrompt(db, characterPrompt)

    const scenePrompt: ScenePrompt = {
      id: randomUUID(),
      projectId: project.id,
      srtBlockId,
      blockIndex: 1,
      relevantCharacterIds: ['@Hero'],
      prompt: 'Comic page layout, hero says hello.',
      status: 'success',
      attempts: 1,
      error: null,
      updatedAt: now
    }
    upsertScenePrompt(db, scenePrompt)

    const { folderPath } = exportService.export(project.id, tmpDir)

    // Every project falls back to the migration-seeded "Default" channel
    // when created without an explicit channelId (see ProjectService.create).
    expect(folderPath).toBe(join(tmpDir, 'Default', 'My Test Project'))
    expect(readFileSync(join(folderPath, 'My Test Project.srt'), 'utf-8')).toBe(
      '1\n00:00:00,000 --> 00:00:03,000\nHello world.\n'
    )
    expect(readFileSync(join(folderPath, 'character_prompts.txt'), 'utf-8')).toBe(
      '@Hero: Character design of @Hero, brave protagonist.\n'
    )
    expect(readFileSync(join(folderPath, 'image_prompts.txt'), 'utf-8')).toBe(
      'PROMPT 001: Comic page layout, hero says hello.\n'
    )
    expect(readFileSync(join(folderPath, 'character_list.txt'), 'utf-8')).toBe('Hero\n')
  })

  it('sanitizes a project name with path-invalid characters for the folder/file name', () => {
    const project = projectService.create({ name: 'Weird: Name / Test?', transcript: 'Hi.' })
    const { folderPath } = exportService.export(project.id, tmpDir)
    expect(folderPath).toBe(join(tmpDir, 'Default', 'Weird_ Name _ Test_'))
    expect(() => readFileSync(join(folderPath, 'Weird_ Name _ Test_.srt'), 'utf-8')).not.toThrow()
  })

  it('does not write character_list.txt for a project with no characters', () => {
    const project = projectService.create({ name: 'No Characters Project', transcript: 'Hi.' })
    const { folderPath } = exportService.export(project.id, tmpDir)
    expect(existsSync(join(folderPath, 'character_list.txt'))).toBe(false)
  })

  it('throws for an unknown project id', () => {
    expect(() => exportService.export(randomUUID(), tmpDir)).toThrow('Project not found')
  })

  it('writes empty files when nothing has been generated yet', () => {
    const project = projectService.create({ name: 'Empty Project', transcript: '' })
    const { folderPath } = exportService.export(project.id, tmpDir)
    expect(readFileSync(join(folderPath, 'Empty Project.srt'), 'utf-8')).toBe('')
    expect(readFileSync(join(folderPath, 'character_prompts.txt'), 'utf-8')).toBe('')
    expect(readFileSync(join(folderPath, 'image_prompts.txt'), 'utf-8')).toBe('')
  })

  // Phase 20 (user request) — nests output under a channel-name folder so
  // projects from different channels never collide in the same base folder.
  it('nests the output folder under the project\'s channel name', () => {
    const channelService = new ChannelService(db)
    const channel = channelService.create({
      name: 'Historical Manhua',
      avgCharacters: 300,
      variancePercent: 30,
      fakeDurationSec: 3,
      selectedModel: null,
      characterDetectionPrompt: 'd {{TRANSCRIPT}}',
      characterGenerationPrompt: 'g {{CHARACTERS}}',
      sceneGenerationPrompt: 's {{BLOCK_NUMBER}} {{SRT_TEXT}} {{RELEVANT_CHARACTERS}} {{RELEVANT_CHARACTER_PROMPTS}}',
      sceneGenerationPromptNoCharacters: 'no-characters s {{BLOCK_NUMBER}} {{SRT_TEXT}}',
      sceneConcurrency: 4,
      sceneBatchSize: 10,
      hasCharacters: true
    })
    const project = projectService.create({ name: 'In a channel', transcript: '', channelId: channel.id })

    const { folderPath } = exportService.export(project.id, tmpDir)

    expect(folderPath).toBe(join(tmpDir, 'Historical Manhua', 'In a channel'))
  })

  it('resolveFolderPath() matches export()\'s path without touching disk', () => {
    const project = projectService.create({ name: 'Preview only', transcript: '' })
    expect(exportService.resolveFolderPath(project.id, tmpDir)).toBe(join(tmpDir, 'Default', 'Preview only'))
  })
})
