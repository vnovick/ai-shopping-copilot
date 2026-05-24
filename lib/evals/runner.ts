// Runs every case in `cases.ts` through the production pipeline end to
// end. Two model calls per case: `extractIntent` (gives the typed intent
// for structural assertions) and `streamCopilot` (full branch — runs
// search + streamed reply, which we consume to recover text and any
// data-products part).
//
// Invoke via `pnpm eval`. ~$0.003 per case on gpt-5.4-mini.

import type { UIMessage } from 'ai'
import { extractIntent } from '@/lib/ai/intent'
import { streamCopilot } from '@/lib/ai/orchestrator'
import type { Product } from '@/lib/products/types'
import { evalCases, type EvalCase } from './cases'
import type { IntentTurn } from './assertions'

function toUiMessages(messages: EvalCase['messages']): UIMessage[] {
  return messages.map<UIMessage>((m, i) => ({
    id: `eval-${i}`,
    role: m.role,
    parts: [{ type: 'text', text: m.text }],
  }))
}

// Parses the UI-message SSE stream into text deltas + any data-products
// part. Everything else is dropped.
async function consumeUiStream(
  response: Response,
): Promise<{ text: string; products: Product[] }> {
  const raw = await response.text()
  let text = ''
  let products: Product[] = []

  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const payload = line.slice(6).trim()
    if (!payload || payload === '[DONE]') continue
    let chunk: unknown
    try {
      chunk = JSON.parse(payload)
    } catch {
      continue
    }
    if (!isObject(chunk) || typeof chunk.type !== 'string') continue

    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      text += chunk.delta
    } else if (chunk.type === 'data-products' && isObject(chunk.data)) {
      const data = chunk.data as { products?: Product[] }
      if (Array.isArray(data.products)) products = data.products
    }
  }

  return { text, products }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

async function runCase(messages: EvalCase['messages']): Promise<IntentTurn> {
  const uiMessages = toUiMessages(messages)

  const intent = await extractIntent(uiMessages)
  const response = await streamCopilot({ messages: uiMessages })
  const { text, products } = await consumeUiStream(response)

  return { intent, products, text }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required. Run via `pnpm eval` (loads .env.local).')
    process.exit(1)
  }

  let pass = 0
  let fail = 0
  const failures: string[] = []

  for (const c of evalCases) {
    process.stdout.write(`\n${c.name}\n`)
    let turn: IntentTurn
    try {
      turn = await runCase(c.messages)
    } catch (err) {
      console.error(`  ✗ run failed: ${(err as Error).message}`)
      fail++
      failures.push(`${c.name} / run`)
      continue
    }

    for (const a of c.assertions) {
      if (a.check(turn)) {
        console.log(`  ✓ ${a.name}`)
        pass++
      } else {
        console.log(`  ✗ ${a.name}`)
        console.log(`    intent  : ${JSON.stringify(turn.intent)}`)
        console.log(`    products: ${turn.products.length}`)
        console.log(`    text    : ${JSON.stringify(turn.text)}`)
        fail++
        failures.push(`${c.name} / ${a.name}`)
      }
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) {
    console.log('Failures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
