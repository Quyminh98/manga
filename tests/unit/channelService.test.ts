import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/db/client'
import { ChannelService } from '../../src/main/services/ChannelService'
import { ProjectService } from '../../src/main/services/ProjectService'

let db: Database.Database
let service: ChannelService

const validInput = {
  name: 'Historical Manhua',
  avgCharacters: 400,
  variancePercent: 25,
  fakeDurationSec: 4,
  selectedModel: 'gpt-5.5',
  characterDetectionPrompt: 'detect {{TRANSCRIPT}}',
  characterGenerationPrompt: 'generate {{CHARACTERS}}',
  sceneGenerationPrompt: 'scene {{BLOCK_NUMBER}} {{SRT_TEXT}} {{RELEVANT_CHARACTERS}} {{RELEVANT_CHARACTER_PROMPTS}}',
  sceneGenerationPromptNoCharacters: 'scene no-characters {{BLOCK_NUMBER}} {{SRT_TEXT}}',
  sceneConcurrency: 3,
  sceneBatchSize: 12,
  hasCharacters: true
}

beforeEach(() => {
  db = createDatabase(':memory:')
  service = new ChannelService(db)
})

describe('ChannelService', () => {
  // Migration 0004_add_channels always seeds exactly one "Default" channel
  // into a fresh database — every test here starts from that baseline.
  it('list() includes the migration-seeded "Default" channel', () => {
    const channels = service.list()
    expect(channels).toHaveLength(1)
    expect(channels[0].name).toBe('Default')
    expect(channels[0].projectCount).toBe(0)
    expect(channels[0].hasCharacters).toBe(true)
  })

  it('create()/update() roundtrip hasCharacters=false', () => {
    const channel = service.create({ ...validInput, hasCharacters: false })
    expect(channel.hasCharacters).toBe(false)
    expect(service.get(channel.id)?.hasCharacters).toBe(false)

    const updated = service.update(channel.id, { ...validInput, hasCharacters: true })
    expect(updated.hasCharacters).toBe(true)
  })

  it('create() persists a channel with the given settings', () => {
    const channel = service.create(validInput)

    expect(channel.id).toBeTruthy()
    expect(channel.name).toBe('Historical Manhua')
    expect(channel.avgCharacters).toBe(400)
    expect(channel.variancePercent).toBe(25)
    expect(channel.sceneConcurrency).toBe(3)
    expect(channel.sceneBatchSize).toBe(12)
    expect(service.get(channel.id)).toEqual(channel)
  })

  it('create() rejects a blank name', () => {
    expect(() => service.create({ ...validInput, name: '   ' })).toThrow('Channel name is required')
  })

  it.each([
    ['avgCharacters', 29],
    ['avgCharacters', 2001],
    ['variancePercent', -1],
    ['variancePercent', 91],
    ['fakeDurationSec', 0],
    ['fakeDurationSec', 31],
    ['sceneConcurrency', 0],
    ['sceneConcurrency', 11],
    ['sceneBatchSize', 0],
    ['sceneBatchSize', 31]
  ])('create() rejects %s out of range (%d)', (field, value) => {
    expect(() => service.create({ ...validInput, [field]: value })).toThrow()
  })

  it('create() accepts the upper bounds sceneConcurrency=10 and sceneBatchSize=30', () => {
    const channel = service.create({ ...validInput, sceneConcurrency: 10, sceneBatchSize: 30 })
    expect(channel.sceneConcurrency).toBe(10)
    expect(channel.sceneBatchSize).toBe(30)
  })

  it('create() rejects an empty prompt', () => {
    expect(() => service.create({ ...validInput, characterDetectionPrompt: '   ' })).toThrow(
      'Character Detection prompt is required.'
    )
  })

  it('create() rejects an empty sceneGenerationPromptNoCharacters', () => {
    expect(() => service.create({ ...validInput, sceneGenerationPromptNoCharacters: '   ' })).toThrow(
      'Scene / Image Generation prompt (No Characters) is required.'
    )
  })

  it('create()/get() roundtrips sceneGenerationPromptNoCharacters', () => {
    const channel = service.create(validInput)
    expect(channel.sceneGenerationPromptNoCharacters).toBe(validInput.sceneGenerationPromptNoCharacters)
    expect(service.get(channel.id)?.sceneGenerationPromptNoCharacters).toBe(validInput.sceneGenerationPromptNoCharacters)
  })

  it('update() overwrites every field and bumps updated_at', async () => {
    const channel = service.create(validInput)
    await new Promise((resolve) => setTimeout(resolve, 5))

    const updated = service.update(channel.id, { ...validInput, name: 'Renamed', avgCharacters: 900 })

    expect(updated.name).toBe('Renamed')
    expect(updated.avgCharacters).toBe(900)
    expect(updated.updatedAt > channel.updatedAt).toBe(true)
  })

  it('update() throws for an unknown channel id', () => {
    expect(() => service.update('unknown-id', validInput)).toThrow('Channel not found')
  })

  it('delete() removes a channel with no projects', () => {
    const channel = service.create(validInput)
    service.delete(channel.id)
    expect(service.get(channel.id)).toBeNull()
  })

  it('delete() refuses a channel that still has projects', () => {
    const channel = service.create(validInput)
    new ProjectService(db).create({ name: 'In channel', transcript: '', channelId: channel.id })

    expect(() => service.delete(channel.id)).toThrow('Cannot delete a channel that still has projects')
    expect(service.get(channel.id)).not.toBeNull()
  })

  it('delete() refuses to remove the last remaining channel', () => {
    // Only the migration-seeded "Default" channel exists at this point.
    const [defaultChannel] = service.list()
    expect(() => service.delete(defaultChannel.id)).toThrow('Cannot delete the last remaining channel')
  })

  it('delete() succeeds once a second channel exists and this one has no projects', () => {
    const [defaultChannel] = service.list()
    service.create(validInput)

    service.delete(defaultChannel.id)

    expect(service.get(defaultChannel.id)).toBeNull()
    expect(service.list()).toHaveLength(1)
  })

  it('delete() throws for an unknown channel id', () => {
    expect(() => service.delete('unknown-id')).toThrow('Channel not found')
  })

  it('list() reports projectCount per channel', () => {
    const channel = service.create(validInput)
    const projectService = new ProjectService(db)
    projectService.create({ name: 'One', transcript: '', channelId: channel.id })
    projectService.create({ name: 'Two', transcript: '', channelId: channel.id })

    const [, created] = service.list().sort((a, b) => a.name.localeCompare(b.name))
    expect(created.projectCount).toBe(2)
  })
})
