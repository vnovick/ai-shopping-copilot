import type { UIMessage } from 'ai'
import { notFound } from 'next/navigation'
import { Chat } from '@/components/chat/chat'
import { getChat, getMessagesByChat } from '@/lib/db/queries'

type ChatPageProps = { params: Promise<{ id: string }> }

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params
  const chat = await getChat(id)
  if (!chat) notFound()

  const stored = await getMessagesByChat(id)
  const initialMessages: UIMessage[] = stored.map((m) => ({
    id: m.id,
    role: m.role,
    // `parts` is stored as JSON of UIMessagePart[]; trust the schema.
    parts: m.parts as UIMessage['parts'],
  }))

  return <Chat id={id} initialMessages={initialMessages} />
}
