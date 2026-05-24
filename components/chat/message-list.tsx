'use client'

import { useEffect, useRef } from 'react'
import type { ChatStatus, UIMessage } from 'ai'
import { MessageItem } from './message-item'

type MessageListProps = {
  messages: UIMessage[]
  status: ChatStatus
}

export function MessageList({ messages, status }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Ask me what you&apos;re looking for to get started.
        </div>
      ) : (
        messages.map((message) => <MessageItem key={message.id} message={message} />)
      )}
      {status === 'submitted' && (
        <div className="text-xs text-muted-foreground">Thinking…</div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
