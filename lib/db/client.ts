import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

let sqliteInstance: Database.Database | null = null
let drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | null = null

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_FILE
  if (fromEnv === ':memory:') return ':memory:'
  // Always resolve to an absolute path so the connection doesn't depend on
  // who invoked the process (Cursor, tests, dev server, scripts).
  return fromEnv ? resolve(process.cwd(), fromEnv) : resolve(process.cwd(), 'local.db')
}

export function getSqlite(): Database.Database {
  if (!sqliteInstance) {
    sqliteInstance = new Database(resolveDbPath())
    sqliteInstance.pragma('journal_mode = WAL')
    sqliteInstance.pragma('foreign_keys = ON')
  }
  return sqliteInstance
}

export function getDb() {
  if (!drizzleInstance) {
    drizzleInstance = drizzle(getSqlite(), { schema })
  }
  return drizzleInstance
}

// Closes the connection and clears the singleton — tests use this to
// reset between cases when they swap DATABASE_FILE to `:memory:`.
export function resetDbForTests(): void {
  if (sqliteInstance) sqliteInstance.close()
  sqliteInstance = null
  drizzleInstance = null
}
