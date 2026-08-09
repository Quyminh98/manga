import { randomUUID } from 'crypto'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/db/client'
import { ProjectService } from '../../src/main/services/ProjectService'
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

    expect(folderPath).toBe(join(tmpDir, 'My Test Project'))
    expect(readFileSync(join(folderPath, 'My Test Project.srt'), 'utf-8')).toBe(
      '1\n00:00:00,000 --> 00:00:03,000\nHello world.\n'
    )
    expect(readFileSync(join(folderPath, 'character_prompts.txt'), 'utf-8')).toBe(
      'CHARACTER 001 — @Hero\n\nCharacter design of @Hero, brave protagonist.\n'
    )
    expect(readFileSync(join(folderPath, 'image_prompts.txt'), 'utf-8')).toBe(
      'PROMPT 001:\n\nComic page layout, hero says hello.\n'
    )
  })

  it('sanitizes a project name with path-invalid characters for the folder/file name', () => {
    const project = projectService.create({ name: 'Weird: Name / Test?', transcript: 'Hi.' })
    const { folderPath } = exportService.export(project.id, tmpDir)
    expect(folderPath).toBe(join(tmpDir, 'Weird_ Name _ Test_'))
    expect(() => readFileSync(join(folderPath, 'Weird_ Name _ Test_.srt'), 'utf-8')).not.toThrow()
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
})
