import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { UIMessage } from 'ai'

// The shape AI SDK persists per assistant turn: text deltas + the
// orchestrator-written `data-products` part, sometimes a tool call.
// Typing the JSON column lifts `getMessagesByChat` from `unknown[]`
// to the same union the rest of the codebase uses.
type StoredMessagePart = UIMessage['parts'][number]

export const chats = sqliteTable(
  'chats',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  // Index for the sidebar list query (`getChats` orders by createdAt desc).
  (t) => [index('chats_created_at_idx').on(t.createdAt)],
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    parts: text('parts', { mode: 'json' }).$type<StoredMessagePart[]>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  // SQLite doesn't auto-index foreign keys — without this every
  // `getMessagesByChat` and every cascade delete was a full table scan.
  (t) => [index('messages_chat_id_idx').on(t.chatId)],
)

export type Chat = typeof chats.$inferSelect
export type Message = typeof messages.$inferSelect
