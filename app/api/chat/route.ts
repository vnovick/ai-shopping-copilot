import type { UIMessage } from 'ai'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { streamCopilot } from '@/lib/ai/orchestrator'
import { persistFirstTurnAtomic, saveMessages } from '@/lib/db/queries'

export const runtime = 'nodejs'

// 1 MB cap on the request body. A real chat turn is a few KB; anything
// past this is either a buggy client or an attack.
const MAX_BODY_BYTES = 1_000_000

// Structural shape we actually read from. Permissive on `parts` (the AI
// SDK's UIMessagePart union evolves) but strict on the fields the route
// relies on for routing and persistence.
const RequestSchema = z.object({
  id: z.string().min(1).max(200),
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        role: z.enum(['user', 'assistant', 'system']),
        parts: z.array(z.unknown()).max(50),
      }),
    )
    .min(1)
    .max(200),
})

type ChatErrorResponse = {
  status: number
  body: string
  headers?: Record<string, string>
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BODY_BYTES) {
    return new Response('payload too large', { status: 413 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return new Response('invalid JSON', { status: 400 })
  }

  const parsed = RequestSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response('invalid request body', { status: 400 })
  }
  const { id, messages } = parsed.data as { id: string; messages: UIMessage[] }

  const lastUser = messages.at(-1)
  if (!lastUser || lastUser.role !== 'user') {
    return new Response('expected the last message to be a user message', { status: 400 })
  }

  // Atomic + idempotent: a concurrent retry no-ops instead of 500ing.
  persistFirstTurnAtomic({
    chatId: id,
    title: titleFromUserMessage(lastUser),
    userMessage: {
      id: lastUser.id,
      chatId: id,
      role: 'user',
      parts: lastUser.parts,
    },
  })

  try {
    return await streamCopilot({
      messages,
      // Cancels the streamText call when the client navigates away mid-stream.
      signal: request.signal,
      // onFinish fires after the assistant turn streams. Persist then.
      onFinish: async ({ responseMessage }) => {
        const assistantMessageId = responseMessage.id || nanoid()
        try {
          await saveMessages([
            {
              id: assistantMessageId,
              chatId: id,
              role: 'assistant',
              parts: responseMessage.parts,
            },
          ])
        } catch (err) {
          // Stream already drained to the client — don't fail the response.
          // TODO(retry-queue): persist failed writes for next-request retry.
          console.error('[api/chat] failed to persist assistant message', {
            chatId: id,
            assistantMessageId,
            err: serializeError(err),
          })
        }
      },
    })
  } catch (err) {
    return errorResponse(classifyError(err), {
      chatId: id,
      lastUserMessageId: lastUser.id,
      err,
    })
  }
}

function titleFromUserMessage(message: UIMessage): string {
  const text = message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim()
  return text.slice(0, 60) || 'New chat'
}

// Narrow — special-case only what the AI SDK + OpenAI provider produce.
function classifyError(err: unknown): ChatErrorResponse {
  const e = err as { status?: number; statusCode?: number; name?: string }
  const providerStatus = e.status ?? e.statusCode

  if (providerStatus === 429) {
    return {
      status: 429,
      body: 'Rate limit hit — please try again in a moment.',
      headers: { 'Retry-After': '5' },
    }
  }
  if (providerStatus === 401 || providerStatus === 403) {
    return { status: 503, body: 'LLM provider is currently unavailable.' }
  }
  return { status: 500, body: 'An internal error occurred while starting the response.' }
}

function errorResponse(
  classified: ChatErrorResponse,
  context: { chatId: string; lastUserMessageId: string; err: unknown },
): Response {
  console.error('[api/chat] streamCopilot failed', {
    ...context,
    err: serializeError(context.err),
    classifiedStatus: classified.status,
  })
  return new Response(classified.body, {
    status: classified.status,
    headers: classified.headers,
  })
}

function serializeError(err: unknown): { name?: string; message?: string; status?: number } {
  if (err instanceof Error) {
    const e = err as Error & { status?: number; statusCode?: number }
    return { name: e.name, message: e.message, status: e.status ?? e.statusCode }
  }
  return { message: String(err) }
}
