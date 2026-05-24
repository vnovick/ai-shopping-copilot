// Structured-output intent classifier. Routes the entire request into
// `shopping` / `chitchat` / `clarification` for the orchestrator.
//
// Schema is flat (every field nullable, single `type` discriminator)
// because OpenAI Structured Outputs reject `oneOf` / `anyOf`. We
// `narrow()` the raw object into a discriminated union so the rest of
// the codebase keeps a clean typed API.

import { openai } from '@ai-sdk/openai'
import {
  convertToModelMessages,
  generateText,
  Output,
  type LanguageModel,
  type UIMessage,
} from 'ai'
import { z } from 'zod'
import { OPENAI_MODEL_ID } from './model'

const SORT_BY = ['relevance', 'price-asc', 'price-desc', 'rating-desc'] as const

// Flat, all-nullable schema — Structured Outputs rejects `optional`/`oneOf`.
// All fields apply to `shopping`; for `chitchat`/`clarification` the
// classifier sets them to null and `narrow()` drops them.
const RawIntentSchema = z.object({
  type: z.enum(['shopping', 'chitchat', 'clarification']),
  query: z.string().nullable(),
  category: z.string().nullable(),
  priceMin: z.number().nonnegative().nullable(),
  priceMax: z.number().nonnegative().nullable(),
  minRating: z.number().min(0).max(5).nullable(),
  sortBy: z.enum(SORT_BY).nullable(),
  k: z.number().int().min(1).max(12).nullable(),
})

export type Intent =
  | {
      type: 'shopping'
      query?: string
      category?: string
      priceMin?: number
      priceMax?: number
      minRating?: number
      sortBy?: (typeof SORT_BY)[number]
      k: number
    }
  | { type: 'chitchat' }
  | { type: 'clarification' }

// Public consumer surface is the narrowed `Intent`. Raw schema is
// re-exported for tests that need to validate model output directly.
export const IntentSchema = RawIntentSchema

function narrow(raw: z.infer<typeof RawIntentSchema>): Intent {
  switch (raw.type) {
    case 'shopping':
      return {
        type: 'shopping',
        query: raw.query ?? undefined,
        category: raw.category ?? undefined,
        priceMin: raw.priceMin ?? undefined,
        priceMax: raw.priceMax ?? undefined,
        minRating: raw.minRating ?? undefined,
        sortBy: raw.sortBy ?? undefined,
        k: raw.k ?? 6,
      }
    case 'chitchat':
      return { type: 'chitchat' }
    case 'clarification':
      return { type: 'clarification' }
  }
}

const INTENT_PROMPT = `Classify the user's latest message in the context of the conversation so far.

Pick exactly one intent and set the matching fields; set every field that doesn't apply to null.

Context awareness (important): the conversation history carries forward. When prior turns established what the user is shopping for (a product type, category, or constraint like priceMax), brief follow-ups are shopping — not clarification. Re-extract the prior constraints and apply the new turn's change. Examples: "the best one" → shopping with sortBy="rating-desc" and prior priceMax/category carried forward; "cheaper ones" → shopping with sortBy="price-asc"; "in a different category" or "maybe somewhere else" → shopping with prior query carried forward and category=null. Don't ask the user to restate something the conversation already settled.

- type="shopping" — the user wants to find or refine products. Extract constraints they actually stated:
    - query              (free-text search, e.g. "wireless headphones")
    - category           (a real catalogue slug like "smartphones" or "beauty"; null if unsure — don't invent slugs)
    - priceMin/priceMax  (USD; null if not specified)
    - minRating          (0..5; null if not specified)
    - sortBy             ("relevance" | "price-asc" | "price-desc" | "rating-desc"; null if not specified)
    - k                  (number of results implied: "the cheapest" → 1, "a few" → 3, default 6)

    Query/category dedup rule (important): set query ONLY when it adds information the category doesn't — a brand, colour, attribute, or specific feature. If the query would just restate the category in user-friendly words ("men shirt" for mens-shirts, "smartphone" for smartphones, "laptops" for laptops), leave query as null. Same goes for singular/plural variants: if the user names a category in any form, it belongs in category, not in query.
- type="chitchat" — greeting, weather, off-topic. The chat will reply briefly and steer back to shopping.
    All other fields → null.
- type="clarification" — LAST RESORT, reserved for genuinely under-specified first turns with no usable prior context (e.g. "I want a gift" said on turn one with no other signal). Never use clarification when the conversation already established what's being shopped for — that's shopping with the new turn's change applied. The reply step will craft the actual clarifying question grounded in the live catalogue.
    All other fields → null.

Don't fill optional fields with placeholders — priceMax=0 is "nothing under $0", not "no constraint". Use null for "no constraint".`

type ExtractIntentOptions = {
  /** Override for tests. Defaults to `OPENAI_MODEL_ID` via @ai-sdk/openai. */
  model?: LanguageModel
}

export async function extractIntent(
  messages: UIMessage[],
  opts: ExtractIntentOptions = {},
): Promise<Intent> {
  const modelMessages = await convertToModelMessages(messages)
  const { output } = await generateText({
    model: opts.model ?? openai(OPENAI_MODEL_ID),
    output: Output.object({
      schema: RawIntentSchema,
      name: 'Intent',
      description: "Classification of the user's latest message",
    }),
    system: INTENT_PROMPT,
    messages: modelMessages,
  })
  return narrow(output)
}
