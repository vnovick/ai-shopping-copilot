// Pure helpers — inspect an `IntentTurn` (classifier output + retrieval
// result + the assistant's streamed prose). The text assertions below
// guard the prompt-rule surface ("no markdown", "no product names in
// text", "apologise on empty", "steer back on off-topic").

import type { Intent } from '@/lib/ai/intent'
import type { Product } from '@/lib/products/types'

export type IntentTurn = {
  intent: Intent
  products: Product[]
  text: string
}

export function intentTypeWas(turn: IntentTurn, type: Intent['type']): boolean {
  return turn.intent.type === type
}

export function shoppingArgsMatch(
  turn: IntentTurn,
  predicate: (i: Extract<Intent, { type: 'shopping' }>) => boolean,
): boolean {
  return turn.intent.type === 'shopping' && predicate(turn.intent)
}

export function productsCount(turn: IntentTurn): number {
  return turn.products.length
}

export function uniqueProductIds(turn: IntentTurn): number[] {
  return Array.from(new Set(turn.products.map((p) => p.id)))
}

export function firstResultPrice(turn: IntentTurn): number | undefined {
  return turn.products[0]?.price
}

export function firstResultRating(turn: IntentTurn): number | undefined {
  return turn.products[0]?.rating
}

// ────────────────────────────────────────────────────────────────────
// Text assertions
// ────────────────────────────────────────────────────────────────────

// Hallucination guard — shopping prompt forbids product details in text.
export function textMentionsAnyProductTitle(turn: IntentTurn): boolean {
  if (turn.products.length === 0) return false
  const lower = turn.text.toLowerCase()
  return turn.products.some((p) => {
    const t = p.title.trim().toLowerCase()
    // Skip absurdly short or empty titles — substring match would be too noisy.
    return t.length >= 3 && lower.includes(t)
  })
}

// True if the reply contains anything that sounds like an apology — used
// on empty-result cases where the prompt requires the model to apologise
// + suggest a refinement.
export function textContainsApology(turn: IntentTurn): boolean {
  return /\b(sorry|apolog|couldn'?t find|no (results|matches|products))\b/i.test(
    turn.text,
  )
}

// True if the reply steers the user back to shopping — used on chitchat
// cases where the prompt says to redirect (e.g. asking what they're
// looking for).
export function textSteersToShopping(turn: IntentTurn): boolean {
  // Word-prefix matches so "shopping" / "products" / "browsing" / "finding"
  // / "catalogue" all qualify. `\b` at the start prevents false hits
  // inside unrelated words ("workshop" → no match).
  return /\b(?:shop\w*|product\w*|catalog\w*|brows\w*|find\w*|looking for|help.*find)/i.test(
    turn.text,
  )
}

// True if the reply ends with a question — used on clarification cases
// where the prompt asks for exactly one clarifying question.
export function textIsQuestion(turn: IntentTurn): boolean {
  const trimmed = turn.text.trim()
  if (!trimmed) return false
  // Last non-whitespace char should be '?'. Accept trailing emoji etc.
  return /\?[)\s"'!.…]*$/.test(trimmed)
}

// True if the reply respects the "max 2 sentences" budget the shopping
// + chitchat prompts impose. Crude — splits on sentence terminators —
// but catches gross runaway responses.
export function textIsConcise(turn: IntentTurn, maxSentences = 3): boolean {
  if (!turn.text.trim()) return false
  const sentences = turn.text
    .split(/[.!?]+(?=\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return sentences.length <= maxSentences
}

// True if the reply contains any markdown formatting the prompts forbid:
// `**bold**`, `## headings`, `- bullets at line start`, `[links](...)`.
export function textHasNoMarkdown(turn: IntentTurn): boolean {
  if (!turn.text) return true
  if (/\*\*[^*]+\*\*/.test(turn.text)) return false
  if (/^#{1,6}\s/m.test(turn.text)) return false
  if (/^\s*[-*]\s+\S/m.test(turn.text)) return false
  if (/\[[^\]]+\]\([^)]+\)/.test(turn.text)) return false
  return true
}
