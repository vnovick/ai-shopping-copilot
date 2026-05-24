import { defineConfig } from 'drizzle-kit'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, resolve } from 'node:path'

// Anchor every DB path to this config file's location so tools that invoke
// drizzle from a different cwd (e.g. the Cursor extension) still find the
// right SQLite file. This applies to the default *and* to anything that
// .env.local sets — `DATABASE_FILE=./local.db` was previously passed through
// as a relative path and broke under Cursor.
const here = dirname(fileURLToPath(import.meta.url))

function resolveDb(value: string | undefined): string {
  if (!value) return resolve(here, 'local.db')
  if (value === ':memory:') return value
  return isAbsolute(value) ? value : resolve(here, value)
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: resolveDb(process.env.DATABASE_FILE),
  },
})
