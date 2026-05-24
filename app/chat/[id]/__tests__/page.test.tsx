import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getChat: vi.fn(),
  getMessagesByChat: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('@/components/chat/chat', () => ({
  Chat: ({ id, initialMessages }: { id: string; initialMessages?: unknown[] }) => (
    <div data-testid="chat" data-id={id} data-msgs={initialMessages?.length ?? 0} />
  ),
}))

import { getChat, getMessagesByChat } from '@/lib/db/queries'
import ChatPage from '../page'

describe('app/chat/[id]/page', () => {
  it('renders Chat hydrated with persisted messages', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'c1',
      title: 't',
      createdAt: new Date(),
    })
    vi.mocked(getMessagesByChat).mockResolvedValue([
      {
        id: 'm1',
        chatId: 'c1',
        role: 'user',
        parts: [{ type: 'text', text: 'hi' }],
        createdAt: new Date(),
      },
      {
        id: 'm2',
        chatId: 'c1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello' }],
        createdAt: new Date(),
      },
    ])

    const page = await ChatPage({ params: Promise.resolve({ id: 'c1' }) })
    render(page)

    expect(screen.getByTestId('chat')).toHaveAttribute('data-id', 'c1')
    expect(screen.getByTestId('chat')).toHaveAttribute('data-msgs', '2')
  })

  it('calls notFound() when the chat is missing', async () => {
    vi.mocked(getChat).mockResolvedValue(null)
    await expect(
      ChatPage({ params: Promise.resolve({ id: 'nope' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
