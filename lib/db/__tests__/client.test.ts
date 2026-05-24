import { afterEach, describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDb, getSqlite, resetDbForTests } from '../client'

describe('db/client', () => {
  afterEach(() => {
    resetDbForTests()
    delete process.env.DATABASE_FILE
  })

  it('migrates an in-memory DB and creates chats + messages tables', () => {
    process.env.DATABASE_FILE = ':memory:'
    const db = getDb()
    migrate(db, { migrationsFolder: './lib/db/migrations' })

    const tables = getSqlite()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
      )
      .all() as { name: string }[]

    expect(tables.map((t) => t.name).sort()).toEqual(['chats', 'messages'])
  })
})
