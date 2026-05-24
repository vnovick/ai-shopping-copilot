import { asc, desc, eq } from 'drizzle-orm'
import { getDb } from './client'
import { chats, messages, type Chat, type Message } from './schema'

// Mirrors the inferred insert shape — typed `parts` flows through from
// the schema, so callers can't pass a raw `unknown[]` by accident.
export type NewMessage = typeof messages.$inferInsert

// Atomic "create chat if it doesn't exist + persist the first user message"
// — the most-trafficked write path in the app. Concurrent POSTs with the
// same `chatId` (double-click, navigation+retry, optimistic retransmit)
// both observe the same final state instead of the second one 500'ing on
// a PK constraint. `onConflictDoNothing` collapses the check-and-insert
// into one atomic op; we don't need the prior `getChat` read.
export function persistFirstTurnAtomic({
  chatId,
  title,
  userMessage,
}: {
  chatId: string
  title: string
  userMessage: NewMessage
}): void {
  getDb().transaction((tx) => {
    tx.insert(chats).values({ id: chatId, title }).onConflictDoNothing().run()
    tx.insert(messages).values(userMessage).onConflictDoNothing().run()
  })
}

export async function getChats(): Promise<Chat[]> {
  return getDb().select().from(chats).orderBy(desc(chats.createdAt)).all()
}

export async function getChat(id: string): Promise<Chat | null> {
  const rows = getDb().select().from(chats).where(eq(chats.id, id)).limit(1).all()
  return rows[0] ?? null
}

export async function getMessagesByChat(chatId: string): Promise<Message[]> {
  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt))
    .all()
}

export async function saveMessages(rows: NewMessage[]): Promise<void> {
  if (rows.length === 0) return
  getDb().insert(messages).values(rows).run()
}

export async function deleteChat(id: string): Promise<void> {
  getDb().delete(chats).where(eq(chats.id, id)).run()
}
