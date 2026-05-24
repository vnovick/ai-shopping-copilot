import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDb } from '../lib/db/client'

const db = getDb()
migrate(db, { migrationsFolder: './lib/db/migrations' })
console.log(`Migrations applied to ${process.env.DATABASE_FILE ?? './local.db'}`)
