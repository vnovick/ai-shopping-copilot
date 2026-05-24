import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UIMessage } from 'ai'

// Mock useChat so the component renders straight from `initialMessages`
// without trying to set up the fetch transport in jsdom.
vi.mock('@ai-sdk/react', () => ({
  useChat: ({ messages }: { messages?: UIMessage[] }) => ({
    messages: messages ?? [],
    sendMessage: vi.fn(),
    status: 'ready' as const,
  }),
}))

// DefaultChatTransport is constructed in Chat but never used in the mocked path.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    DefaultChatTransport: class {},
  }
})

import { Chat } from '../chat'

describe('Chat', () => {
  it('renders both user and assistant messages from initialMessages', () => {
    const initial: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi there' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hello!' }] },
    ]

    render(<Chat id="t1" initialMessages={initial} />)

    expect(screen.getByText('hi there')).toBeInTheDocument()
    expect(screen.getByText('hello!')).toBeInTheDocument()
  })

  it('shows the empty-state hint when there are no messages', () => {
    render(<Chat id="t2" initialMessages={[]} />)

    expect(screen.getByText(/get started/i)).toBeInTheDocument()
  })
})
