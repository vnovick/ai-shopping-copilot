'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { nanoid } from 'nanoid'
import { useCallback, useMemo } from 'react'
import { useSWRConfig } from 'swr'
import { ChatInput } from './chat-input'
import { MessageList } from './message-list'

type ChatProps = {
  id: string
  initialMessages?: UIMessage[]
}

export function Chat({ id, initialMessages }: ChatProps) {
  const { mutate } = useSWRConfig()

  // Stable across renders — useChat is sensitive to transport identity,
  // and the onFinish closure shouldn't be re-bound on every render.
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])
  // Refresh the sidebar list so a brand-new chat appears after its first
  // message lands. Sidebar owns navigation — no auto-redirect from here.
  const onFinish = useCallback(() => {
    void mutate('/api/chats')
  }, [mutate])

  const { messages, sendMessage, status } = useChat({
    id,
    messages: initialMessages,
    // Give client-generated messages stable ids the server can persist.
    generateId: () => nanoid(),
    transport,
    onFinish,
  })

  const busy = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages} status={status} />
      <ChatInput
        disabled={busy}
        onSend={(text) => {
          void sendMessage({ text })
        }}
      />
    </div>
  )
}
