import { app } from 'electron'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { createDatabase } from '../db/client'

// Resolves the real userData DB path and lazily opens a singleton
// connection — the only place in src/main that needs both `electron` and
// better-sqlite3 together (queries/ProjectService stay Electron-free and
// unit-testable via db/client.ts's createDatabase directly).
let db: Database.Database | null = null
let dbPath: string | null = null

export function getDatabasePath(): string {
  if (!dbPath) dbPath = join(app.getPath('userData'), 'storyprompt.sqlite3')
  return dbPath
}

export function getDatabase(): Database.Database {
  if (!db) db = createDatabase(getDatabasePath())
  return db
}
