// Explicit-pipeline orchestrator. The model never decides whether to
// retrieve — `extractIntent` routes the request:
//
//   chitchat       → streamText (CHITCHAT_SYSTEM_PROMPT)
//   clarification  → streamText (CLARIFICATION_SYSTEM_PROMPT)
//   shopping       → searchAndRank → emit `data-products` → streamText
//                    (SHOPPING_SYSTEM_PROMPT + retrieved products injected)
//
// `listCategories` is the only model-facing tool — read-only, on the
// reply step only. Product cards on screen come from the `data-products`
// part written below; the model can never put a card on screen.

import { openai } from '@ai-sdk/openai'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
  type UIMessageStreamOnFinishCallback,
  type UIMessageStreamWriter,
} from 'ai'
import { searchAndRank } from '@/lib/products/search'
import { extractIntent } from './intent'
import { OPENAI_MODEL_ID } from './model'
import {
  CHITCHAT_SYSTEM_PROMPT,
  CLARIFICATION_SYSTEM_PROMPT,
  SHOPPING_SYSTEM_PROMPT,
  formatProductsContext,
} from './prompts'
import { listCategoriesTool } from './tools'

// `streamText` defaults to `stepCountIs(1)` — stops after the model's
// first step. A `listCategories` tool call eats the first step, so we
// need ≥2 to get an assistant reply after it. 5 = comfortable headroom.
const REPLY_STOP = stepCountIs(5)

type StreamCopilotArgs = {
  messages: UIMessage[]
  /** Override for tests. Defaults to `OPENAI_MODEL_ID` via @ai-sdk/openai. */
  model?: LanguageModel
  /** Persistence hook — see app/api/chat/route.ts. */
  onFinish?: UIMessageStreamOnFinishCallback<UIMessage>
  /**
   * Forwarded from the route's `request.signal`. When the client
   * navigates away mid-stream, this aborts the underlying `streamText`
   * call so we stop billing the provider for tokens nobody will read.
   */
  signal?: AbortSignal
}

export async function streamCopilot({
  messages,
  model,
  onFinish,
  signal,
}: StreamCopilotArgs): Promise<Response> {
  const m = model ?? openai(OPENAI_MODEL_ID)

  const stream = createUIMessageStream({
    onFinish,
    execute: async ({ writer }) => {
      const intent = await extractIntent(messages, { model: m })
      const modelMessages = await convertToModelMessages(messages)

      if (intent.type === 'clarification') {
        runReplyStream({ model: m, system: CLARIFICATION_SYSTEM_PROMPT, modelMessages, writer, signal })
        return
      }

      if (intent.type === 'chitchat') {
        runReplyStream({ model: m, system: CHITCHAT_SYSTEM_PROMPT, modelMessages, writer, signal })
        return
      }

      // shopping: deterministic retrieval, then narrate
      const { products, appliedFilters } = await searchAndRank({
        query: intent.query,
        category: intent.category,
        priceMin: intent.priceMin,
        priceMax: intent.priceMax,
        minRating: intent.minRating,
        sortBy: intent.sortBy,
        limit: intent.k,
      })

      // Skip the data-products part on empty retrieval — emitting it
      // renders a "No matches" placeholder card under the assistant
      // message, which can visibly contradict the model if it slips and
      // references earlier turns' products from the conversation history.
      if (products.length > 0) {
        writer.write({
          type: 'data-products',
          id: generateId(),
          data: { products, appliedFilters },
        })
      }

      runReplyStream({
        model: m,
        system: `${SHOPPING_SYSTEM_PROMPT}\n\n${formatProductsContext(products, appliedFilters)}`,
        modelMessages,
        writer,
        signal,
      })
    },
  })

  return createUIMessageStreamResponse({ stream })
}

// Single reply-step helper. Only `system` varies across the three
// branches; centralising makes future additions (new reply-side tools,
// telemetry hooks) one-line edits instead of three.
function runReplyStream({
  model,
  system,
  modelMessages,
  writer,
  signal,
}: {
  model: LanguageModel
  system: string
  modelMessages: ModelMessage[]
  writer: UIMessageStreamWriter<UIMessage>
  signal?: AbortSignal
}): void {
  const result = streamText({
    model,
    system,
    messages: modelMessages,
    tools: { listCategories: listCategoriesTool },
    stopWhen: REPLY_STOP,
    abortSignal: signal,
  })
  writer.merge(result.toUIMessageStream())
}
