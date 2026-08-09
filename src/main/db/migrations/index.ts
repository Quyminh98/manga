import { migration0001Init } from './0001_init'

export interface Migration {
  name: string
  sql: string
}

// Applied in order, tracked in the `_migrations` table (see ../migrate.ts).
export const MIGRATIONS: Migration[] = [migration0001Init]
