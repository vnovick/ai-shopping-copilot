import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai/orchestrator', () => ({
  streamCopilot: vi.fn(),
}))

vi.mock('@/lib/db/queries', () => ({
  persistFirstTurnAtomic: vi.fn(),
  saveMessages: vi.fn(),
}))

import { streamCopilot } from '@/lib/ai/orchestrator'
import { persistFirstTurnAtomic, saveMessages } from '@/lib/db/queries'
import { POST } from '../route'

type OnFinishArg = {
  responseMessage: { id: string; parts: unknown[] }
  messages: unknown[]
  isContinuation: boolean
  isAborted: boolean
}

// Capture the onFinish callback so we can fire it deliberately and
// observe both the success and persistence-failure paths.
function mockStreamResult() {
  let capturedOnFinish: ((e: OnFinishArg) => Promise<void> | void) | undefined
  vi.mocked(streamCopilot).mockImplementation(async (args) => {
    capturedOnFinish = args.onFinish as
      | ((e: OnFinishArg) => Promise<void> | void)
      | undefined
    return new Response('ok', { status: 200 })
  })
  return {
    fireOnFinish: (responseMessage: { id: string; parts: unknown[] }) =>
      capturedOnFinish?.({
        responseMessage,
        messages: [],
        isContinuation: false,
        isAborted: false,
      }),
  }
}

function postReq(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const userMsg = (text: string, id = 'u1') => ({
  id,
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
})

beforeEach(() => vi.clearAllMocks())

describe('POST /api/chat — request validation', () => {
  it('returns 413 when content-length exceeds the 1 MB cap', async () => {
    mockStreamResult()
    const oversizeBody = JSON.stringify({ id: 'c', messages: [userMsg('q')] })
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: oversizeBody,
      headers: { 'content-length': String(2_000_000) },
    })

    const res = await POST(req)

    expect(res.status).toBe(413)
    expect(streamCopilot).not.toHaveBeenCalled()
    expect(persistFirstTurnAtomic).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed JSON', async () => {
    mockStreamResult()
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: '{not valid json',
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(streamCopilot).not.toHaveBeenCalled()
  })

  it('returns 400 when the body is missing required fields', async () => {
    mockStreamResult()
    const res = await POST(postReq({ messages: [userMsg('q')] /* no id */ }))

    expect(res.status).toBe(400)
    expect(streamCopilot).not.toHaveBeenCalled()
    expect(persistFirstTurnAtomic).not.toHaveBeenCalled()
  })

  it('returns 400 when messages is empty', async () => {
    mockStreamResult()
    const res = await POST(postReq({ id: 'c', messages: [] }))

    expect(res.status).toBe(400)
    expect(streamCopilot).not.toHaveBeenCalled()
  })
})

describe('POST /api/chat — happy path persistence', () => {
  it('persists chat + first user message atomically with the right shape', async () => {
    mockStreamResult()

    await POST(postReq({ id: 'chat-1', messages: [userMsg('hello world')] }))

    expect(persistFirstTurnAtomic).toHaveBeenCalledWith({
      chatId: 'chat-1',
      title: 'hello world',
      userMessage: {
        id: 'u1',
        chatId: 'chat-1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello world' }],
      },
    })
  })

  it('truncates the derived title to 60 chars', async () => {
    mockStreamResult()
    const longText = 'a'.repeat(120)

    await POST(postReq({ id: 'chat-long', messages: [userMsg(longText, 'u3')] }))

    expect(persistFirstTurnAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'a'.repeat(60) }),
    )
  })

  it('rejects with 400 when the last message isn\'t a user message', async () => {
    const res = await POST(
      postReq({
        id: 'chat-x',
        messages: [
          { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
        ],
      }),
    )

    expect(res.status).toBe(400)
    expect(streamCopilot).not.toHaveBeenCalled()
    expect(persistFirstTurnAtomic).not.toHaveBeenCalled()
  })

  it('persists the assistant message in onFinish (when it succeeds)', async () => {
    const { fireOnFinish } = mockStreamResult()
    await POST(postReq({ id: 'chat-fin', messages: [userMsg('q', 'u4')] }))

    await fireOnFinish?.({
      id: 'assistant-1',
      parts: [{ type: 'text', text: 'response' }],
    })

    expect(saveMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'assistant-1',
        chatId: 'chat-fin',
        role: 'assistant',
        parts: [{ type: 'text', text: 'response' }],
      }),
    ])
  })

  it('falls back to a fresh id when responseMessage.id is empty', async () => {
    const { fireOnFinish } = mockStreamResult()
    await POST(postReq({ id: 'chat-noid', messages: [userMsg('q', 'u5')] }))

    await fireOnFinish?.({ id: '', parts: [{ type: 'text', text: 'r' }] })

    const calls = vi.mocked(saveMessages).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const firstRow = calls[0][0][0]
    expect(firstRow.id).toBeTruthy()
    expect(firstRow.id).not.toBe('')
  })
})

describe('POST /api/chat — error classification', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('returns 429 + Retry-After on provider rate-limit (status: 429)', async () => {
    vi.mocked(streamCopilot).mockRejectedValue(
      Object.assign(new Error('rate'), { status: 429 }),
    )

    const res = await POST(postReq({ id: 'c', messages: [userMsg('q')] }))

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('5')
  })

  it('returns 503 on provider auth failure (status: 401)', async () => {
    vi.mocked(streamCopilot).mockRejectedValue(
      Object.assign(new Error('auth'), { status: 401 }),
    )

    const res = await POST(postReq({ id: 'c', messages: [userMsg('q')] }))
    expect(res.status).toBe(503)
  })

  it('returns 500 on unknown errors', async () => {
    vi.mocked(streamCopilot).mockRejectedValue(new Error('boom'))

    const res = await POST(postReq({ id: 'c', messages: [userMsg('q')] }))
    expect(res.status).toBe(500)
  })

  it('logs structured context on stream-start failure', async () => {
    vi.mocked(streamCopilot).mockRejectedValue(new Error('boom'))

    await POST(postReq({ id: 'c1', messages: [userMsg('q', 'u9')] }))

    expect(errorSpy).toHaveBeenCalledWith(
      '[api/chat] streamCopilot failed',
      expect.objectContaining({ chatId: 'c1', lastUserMessageId: 'u9' }),
    )
  })
})

describe('POST /api/chat — onFinish persistence failure', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('responds 200 to the client even if assistant persistence rejects', async () => {
    const { fireOnFinish } = mockStreamResult()
    vi.mocked(saveMessages).mockRejectedValueOnce(new Error('disk full'))

    const res = await POST(postReq({ id: 'c', messages: [userMsg('q', 'u10')] }))
    expect(res.status).toBe(200)

    await fireOnFinish?.({ id: 'assistant-1', parts: [{ type: 'text', text: 'r' }] })

    expect(errorSpy).toHaveBeenCalledWith(
      '[api/chat] failed to persist assistant message',
      expect.objectContaining({ chatId: 'c', assistantMessageId: 'assistant-1' }),
    )
  })
})
