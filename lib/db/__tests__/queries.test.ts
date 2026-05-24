import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDb, resetDbForTests } from '../client'
import {
  deleteChat,
  getChat,
  getChats,
  getMessagesByChat,
  persistFirstTurnAtomic,
  saveMessages,
} from '../queries'
import { chats } from '../schema'

// Test-only fixture: a bare chat row without an accompanying user message.
// Production code never wants a chat without a first message — it goes
// through `persistFirstTurnAtomic`. These tests exercise the read/delete
// surface in isolation, so we seed via a direct insert rather than
// introducing a parallel `createChat` export just for tests.
function seedChat(id: string, title: string) {
  getDb().insert(chats).values({ id, title }).run()
}

beforeEach(() => {
  process.env.DATABASE_FILE = ':memory:'
  const db = getDb()
  migrate(db, { migrationsFolder: './lib/db/migrations' })
})

afterEach(() => {
  resetDbForTests()
  delete process.env.DATABASE_FILE
})

describe('db/queries', () => {
  it('getChat returns a seeded chat row with a typed createdAt', async () => {
    seedChat('c1', 'Hello')
    const chat = await getChat('c1')
    expect(chat?.id).toBe('c1')
    expect(chat?.title).toBe('Hello')
    expect(chat?.createdAt).toBeInstanceOf(Date)
  })

  it('getChat returns null for an unknown id', async () => {
    expect(await getChat('nope')).toBeNull()
  })

  it('getChats returns rows ordered by createdAt desc', async () => {
    seedChat('c1', 'first')
    await new Promise((r) => setTimeout(r, 10)) // separate timestamps
    seedChat('c2', 'second')
    const chats = await getChats()
    expect(chats.map((c) => c.id)).toEqual(['c2', 'c1'])
  })

  it('saveMessages persists rows and getMessagesByChat returns them asc', async () => {
    seedChat('c1', 'x')
    await saveMessages([
      { id: 'm1', chatId: 'c1', role: 'user', parts: [{ type: 'text' as const, text: 'hi' }] },
    ])
    await new Promise((r) => setTimeout(r, 10))
    await saveMessages([
      {
        id: 'm2',
        chatId: 'c1',
        role: 'assistant',
        parts: [{ type: 'text' as const, text: 'hello' }],
      },
    ])

    const msgs = await getMessagesByChat('c1')
    expect(msgs.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(msgs[0].parts).toEqual([{ type: 'text', text: 'hi' }])
    expect(msgs[1].role).toBe('assistant')
  })

  it('saveMessages with an empty array is a no-op', async () => {
    seedChat('c1', 'x')
    await expect(saveMessages([])).resolves.not.toThrow()
    expect(await getMessagesByChat('c1')).toEqual([])
  })

  it('deleteChat cascades to messages', async () => {
    seedChat('c1', 'x')
    await saveMessages([{ id: 'm1', chatId: 'c1', role: 'user', parts: [] }])
    await deleteChat('c1')
    expect(await getChat('c1')).toBeNull()
    expect(await getMessagesByChat('c1')).toEqual([])
  })

  describe('persistFirstTurnAtomic (idempotent under concurrent POSTs)', () => {
    it('creates the chat + the user message in one transaction', async () => {
      persistFirstTurnAtomic({
        chatId: 'c1',
        title: 'first',
        userMessage: {
          id: 'm1',
          chatId: 'c1',
          role: 'user',
          parts: [{ type: 'text' as const, text: 'hi' }],
        },
      })

      expect((await getChat('c1'))?.title).toBe('first')
      const msgs = await getMessagesByChat('c1')
      expect(msgs).toHaveLength(1)
      expect(msgs[0].id).toBe('m1')
    })

    it('is a no-op when called twice with the same chat + message ids (double-click safe)', async () => {
      const args = {
        chatId: 'c1',
        title: 'first',
        userMessage: {
          id: 'm1',
          chatId: 'c1',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: 'hi' }],
        },
      }
      persistFirstTurnAtomic(args)
      persistFirstTurnAtomic(args)

      expect(await getChats()).toHaveLength(1)
      expect(await getMessagesByChat('c1')).toHaveLength(1)
    })

    it('keeps the first chat title when a concurrent retry attempts a different one', async () => {
      persistFirstTurnAtomic({
        chatId: 'c1',
        title: 'first',
        userMessage: {
          id: 'm1',
          chatId: 'c1',
          role: 'user',
          parts: [{ type: 'text' as const, text: 'hi' }],
        },
      })
      persistFirstTurnAtomic({
        chatId: 'c1',
        title: 'second-attempt',
        userMessage: {
          id: 'm2',
          chatId: 'c1',
          role: 'user',
          parts: [{ type: 'text', text: 'hi again' }],
        },
      })

      // Chat title is preserved from the first writer (ON CONFLICT DO NOTHING).
      expect((await getChat('c1'))?.title).toBe('first')
      // The second user message (different id) is appended — only the chat
      // row had a conflict, not the message row.
      expect(await getMessagesByChat('c1')).toHaveLength(2)
    })
  })

  it('persists data-products parts as JSON (round-trip)', async () => {
    seedChat('c1', 'x')
    // Mirrors the shape the orchestrator emits via `writer.write({ type: 'data-products', ... })`.
    const richParts: UIMessage['parts'] = [
      { type: 'text', text: 'Here are a few options.' },
      {
        type: 'data-products',
        id: 'p-1',
        data: {
          products: [{ id: 1, title: 'Headphones' }],
          appliedFilters: { sortBy: 'relevance', limit: 6 },
        },
      },
    ]
    await saveMessages([
      { id: 'm1', chatId: 'c1', role: 'assistant', parts: richParts },
    ])
    const [msg] = await getMessagesByChat('c1')
    expect(msg.parts).toEqual(richParts)
  })
})
