import Database from 'better-sqlite3'
import { runMigrations } from './migrate'

// No electron import here on purpose — keeps this factory usable from both
// the real app (DatabaseService resolves the userData path) and from tests
// (createDatabase(':memory:')) without pulling in the Electron runtime.
export function createDatabase(filePath: string): Database.Database {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}
