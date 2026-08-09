import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/db/client'
import { ProjectService } from '../../src/main/services/ProjectService'
import { SrtService } from '../../src/main/services/SrtService'

let db: Database.Database
let projectService: ProjectService
let srtService: SrtService

beforeEach(() => {
  db = createDatabase(':memory:')
  projectService = new ProjectService(db)
  srtService = new SrtService(db)
})

describe('SrtService', () => {
  it('split() persists srt_blocks derived from the project transcript/settings', () => {
    const project = projectService.create(
      { name: 'Splitter test', transcript: 'First sentence here. Second sentence follows.' },
      { maxCharacters: 25, fakeDurationSec: 4 }
    )

    const result = srtService.split(project.id)

    expect(result.length).toBeGreaterThan(0)
    result.forEach((block, i) => {
      expect(block.projectId).toBe(project.id)
      expect(block.blockIndex).toBe(i + 1)
      expect(block.startMs).toBe(i * 4000)
      expect(block.endMs).toBe((i + 1) * 4000)
    })

    expect(srtService.list(project.id)).toEqual(result)
  })

  it('split() replaces the previous block set instead of appending', () => {
    const project = projectService.create({ name: 'Re-split test', transcript: 'One. Two. Three.' }, { maxCharacters: 300, fakeDurationSec: 3 })

    const first = srtService.split(project.id)
    projectService.updateTranscript(project.id, 'A totally different transcript now.')
    const second = srtService.split(project.id)

    const listed = srtService.list(project.id)
    expect(listed).toHaveLength(second.length)
    expect(listed.map((b) => b.text)).not.toEqual(first.map((b) => b.text))
  })

  it('split() throws for an unknown project id', () => {
    expect(() => srtService.split(randomUUID())).toThrow('Project not found')
  })

  it('list() returns an empty array before any split has run', () => {
    const project = projectService.create({ name: 'Unsplit', transcript: 'hello' })
    expect(srtService.list(project.id)).toEqual([])
  })
})
