import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'

// Two deterministic seed chats — both with messages that include a
// `tool-searchProducts` part containing hand-built product fixtures. The
// E2E spec exercises the persisted-state surface (sidebar list, click to
// resume, product cards render from DB-backed parts, delete confirm) so
// the only LLM-dependent path (sending a brand-new message) is skipped —
// that lives in `pnpm eval`.

const DB_FILE = './local-e2e.db'
const DB_ABS = resolve(process.cwd(), DB_FILE)
const MIGRATIONS_DIR = resolve(process.cwd(), 'lib/db/migrations')

const SEED_CHATS = [
  {
    id: 'e2e-chat-headphones',
    title: 'Wireless headphones under $50',
    messages: [
      {
        id: 'e2e-m-h-1',
        role: 'user' as const,
        parts: [{ type: 'text', text: 'Wireless headphones under $50' }],
      },
      {
        id: 'e2e-m-h-2',
        role: 'assistant' as const,
        parts: [
          {
            // Persisted assistant messages carry retrieved products as
            // a `data-products` part — see lib/ai/orchestrator.ts.
            type: 'data-products',
            data: {
              products: [
                {
                  id: 9001,
                  title: 'Studio Wireless Headphones',
                  description: 'Noise-cancelling, over-ear, 30h battery.',
                  category: 'mobile-accessories',
                  price: 39.99,
                  discountPercentage: 0,
                  rating: 4.5,
                  brand: 'Acme Audio',
                  stock: 12,
                  thumbnail: 'https://cdn.dummyjson.com/products/headphones/thumbnail.webp',
                  images: [],
                  availabilityStatus: 'In Stock',
                },
                {
                  id: 9002,
                  title: 'Budget Earbuds',
                  description: 'In-ear, bluetooth 5.0, snug fit.',
                  category: 'mobile-accessories',
                  price: 24.5,
                  discountPercentage: 0,
                  rating: 4.1,
                  brand: 'Acme Audio',
                  stock: 30,
                  thumbnail: 'https://cdn.dummyjson.com/products/earbuds/thumbnail.webp',
                  images: [],
                  availabilityStatus: 'In Stock',
                },
              ],
              appliedFilters: { priceMax: 50, sortBy: 'relevance', limit: 6 },
            },
          },
          { type: 'text', text: 'Here are a couple of options under $50.' },
        ],
      },
    ],
  },
  {
    id: 'e2e-chat-beauty',
    title: 'Beauty products',
    messages: [
      {
        id: 'e2e-m-b-1',
        role: 'user' as const,
        parts: [{ type: 'text', text: 'beauty' }],
      },
      {
        id: 'e2e-m-b-2',
        role: 'assistant' as const,
        parts: [{ type: 'text', text: 'Here are a few beauty picks.' }],
      },
    ],
  },
]

function applyMigrationsTo(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
    // Drizzle-kit separates statements with a sentinel; split + run each.
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const statement of statements) {
      db.exec(statement)
    }
  }
}

async function globalSetup() {
  // Fresh DB every E2E run — no test state bleed.
  for (const ext of ['', '-journal', '-wal', '-shm']) {
    const path = `${DB_ABS}${ext}`
    if (existsSync(path)) unlinkSync(path)
  }

  const db = new Database(DB_ABS)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  applyMigrationsTo(db)

  const baseTs = Date.now()
  const insertChat = db.prepare(
    'INSERT INTO chats (id, title, created_at) VALUES (?, ?, ?)',
  )
  const insertMessage = db.prepare(
    'INSERT INTO messages (id, chat_id, role, parts, created_at) VALUES (?, ?, ?, ?, ?)',
  )

  let cursor = baseTs
  for (const chat of SEED_CHATS) {
    insertChat.run(chat.id, chat.title, cursor)
    cursor += 1
    for (const m of chat.messages) {
      insertMessage.run(m.id, chat.id, m.role, JSON.stringify(m.parts), cursor)
      cursor += 1
    }
  }

  db.close()
}

export default globalSetup
