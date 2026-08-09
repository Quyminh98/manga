import type Database from 'better-sqlite3'
import { MIGRATIONS } from './migrations'

// Idempotent — safe to call on every app start. Tracks applied migrations
// in `_migrations` so re-running never re-executes a CREATE TABLE.
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>
  const applied = new Set(appliedRows.map((row) => row.name))
  const insertMigration = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue
    db.exec(migration.sql)
    insertMigration.run(migration.name, new Date().toISOString())
  }
}
