// Orchestrator branching coverage. Mocks at the boundaries (extractIntent,
// searchAndRank, streamText) and asserts:
//   - right system prompt + tool surface per branch
//   - searchAndRank called only for shopping, with intent → filter forwarding
//   - data-products UI part emitted only for shopping (hallucination guard)
//
// Reply text is out of scope here — that's the eval suite's job (real
// model output, not stubs).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Intent } from '../intent'
import type { Product } from '@/lib/products/types'
import type { AppliedFilters } from '@/lib/products/search'

// Hoisted mock factory — vi.mock runs before imports, so the spies have
// to be created via vi.hoisted to be visible to both the factory and the
// test body.
const mocks = vi.hoisted(() => ({
  extractIntent: vi.fn<(messages: unknown[], opts: unknown) => Promise<Intent>>(),
  searchAndRank: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock('../intent', () => ({
  extractIntent: mocks.extractIntent,
}))

vi.mock('@/lib/products/search', () => ({
  searchAndRank: mocks.searchAndRank,
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: mocks.streamText,
  }
})

import { streamCopilot } from '../orchestrator'
import {
  CHITCHAT_SYSTEM_PROMPT,
  CLARIFICATION_SYSTEM_PROMPT,
  SHOPPING_SYSTEM_PROMPT,
} from '../prompts'

// Returns an empty closed UI-message stream so `writer.merge(...)` can
// drain without doing real model work.
function emptyUiStream() {
  return new ReadableStream({
    start(c) {
      c.close()
    },
  })
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Test Product',
    description: '',
    category: 'misc',
    price: 10,
    discountPercentage: 0,
    rating: 4,
    brand: '',
    stock: 5,
    thumbnail: '',
    images: [],
    availabilityStatus: '',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.extractIntent.mockReset()
  mocks.searchAndRank.mockReset()
  mocks.streamText.mockReset()
  // Default streamText stub — returns an object with toUIMessageStream
  // that yields a closed stream. Branch tests override as needed.
  mocks.streamText.mockReturnValue({
    toUIMessageStream: () => emptyUiStream(),
  } as unknown as ReturnType<typeof import('ai').streamText>)
})

afterEach(() => {
  vi.clearAllMocks()
})

const USER_MSG = [
  { id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] },
]

// `streamCopilot` returns a Response synchronously, but the `execute`
// callback inside `createUIMessageStream` only fires when the body is
// drained. Helper that does both so each test can assert on the spies
// without remembering to consume the stream first.
async function runAndDrain(args: Parameters<typeof streamCopilot>[0]) {
  const response = await streamCopilot(args)
  const body = await response.text()
  return { response, body }
}

describe('streamCopilot — clarification branch', () => {
  beforeEach(() => {
    mocks.extractIntent.mockResolvedValue({ type: 'clarification' })
  })

  it('does NOT call searchAndRank (no retrieval for clarification)', async () => {
    await runAndDrain({ messages: USER_MSG })
    expect(mocks.searchAndRank).not.toHaveBeenCalled()
  })

  it('calls streamText once with the clarification system prompt and listCategories tool', async () => {
    await runAndDrain({ messages: USER_MSG })

    expect(mocks.streamText).toHaveBeenCalledTimes(1)
    const args = mocks.streamText.mock.calls[0][0]
    expect(args.system).toBe(CLARIFICATION_SYSTEM_PROMPT)
    expect(args.tools).toHaveProperty('listCategories')
    expect(args.stopWhen).toBeDefined()
  })

  it('does NOT emit a data-products part (UI shows no product cards on clarification)', async () => {
    const { body } = await runAndDrain({ messages: USER_MSG })
    expect(body).not.toContain('data-products')
  })
})

describe('streamCopilot — chitchat branch', () => {
  beforeEach(() => {
    mocks.extractIntent.mockResolvedValue({ type: 'chitchat' })
  })

  it('does NOT call searchAndRank', async () => {
    await runAndDrain({ messages: USER_MSG })
    expect(mocks.searchAndRank).not.toHaveBeenCalled()
  })

  it('calls streamText with the chitchat system prompt and listCategories tool', async () => {
    await runAndDrain({ messages: USER_MSG })

    expect(mocks.streamText).toHaveBeenCalledTimes(1)
    const args = mocks.streamText.mock.calls[0][0]
    expect(args.system).toBe(CHITCHAT_SYSTEM_PROMPT)
    expect(args.tools).toHaveProperty('listCategories')
  })

  it('does NOT emit a data-products part', async () => {
    const { body } = await runAndDrain({ messages: USER_MSG })
    expect(body).not.toContain('data-products')
  })
})

describe('streamCopilot — shopping branch', () => {
  const products = [
    makeProduct({ id: 7, title: 'Found It', category: 'smartphones', price: 499 }),
  ]
  const appliedFilters: AppliedFilters = {
    query: undefined,
    category: 'smartphones',
    priceMin: undefined,
    priceMax: 500,
    minRating: undefined,
    sortBy: 'price-asc',
    limit: 6,
  }

  beforeEach(() => {
    mocks.extractIntent.mockResolvedValue({
      type: 'shopping',
      query: undefined,
      category: 'smartphones',
      priceMin: undefined,
      priceMax: 500,
      minRating: undefined,
      sortBy: 'price-asc',
      k: 6,
    })
    mocks.searchAndRank.mockResolvedValue({ products, appliedFilters })
  })

  it('forwards every intent field to searchAndRank as filters (k → limit)', async () => {
    await runAndDrain({ messages: USER_MSG })

    expect(mocks.searchAndRank).toHaveBeenCalledTimes(1)
    expect(mocks.searchAndRank).toHaveBeenCalledWith({
      query: undefined,
      category: 'smartphones',
      priceMin: undefined,
      priceMax: 500,
      minRating: undefined,
      sortBy: 'price-asc',
      limit: 6,
    })
  })

  it('emits a data-products part containing the retrieved products', async () => {
    const { body } = await runAndDrain({ messages: USER_MSG })

    expect(body).toContain('data-products')
    // The product surfaces in the stream (UI renders from this, not text).
    expect(body).toContain('Found It')
  })

  it('calls streamText with the shopping prompt and the formatted products context appended', async () => {
    await runAndDrain({ messages: USER_MSG })

    expect(mocks.streamText).toHaveBeenCalledTimes(1)
    const args = mocks.streamText.mock.calls[0][0]
    expect(args.system).toContain(SHOPPING_SYSTEM_PROMPT)
    expect(args.system).toContain('RETRIEVED PRODUCTS')
    expect(args.system).toContain('Found It')
    expect(args.tools).toHaveProperty('listCategories')
  })

  it('does NOT emit a data-products part when retrieval returns empty', async () => {
    // Empty results must not render a contradictory "No matches" card
    // under the model's reply — see prompts.ts for the matching rule.
    mocks.searchAndRank.mockResolvedValueOnce({ products: [], appliedFilters })

    const { body } = await runAndDrain({ messages: USER_MSG })

    expect(body).not.toContain('data-products')
    // The model is still invoked — it apologises via the prompt's "empty" rule.
    expect(mocks.streamText).toHaveBeenCalledTimes(1)
    const args = mocks.streamText.mock.calls[0][0]
    expect(args.system).toContain('RETRIEVED PRODUCTS: none')
  })
})

describe('streamCopilot — onFinish forwarding', () => {
  it('passes the onFinish callback through to the underlying UI message stream', async () => {
    mocks.extractIntent.mockResolvedValue({ type: 'chitchat' })

    const onFinish = vi.fn()
    await runAndDrain({ messages: USER_MSG, onFinish })

    expect(onFinish).toHaveBeenCalled()
  })
})

describe('streamCopilot — abortSignal forwarding', () => {
  it('forwards request.signal into streamText({ abortSignal }) on the chitchat branch', async () => {
    mocks.extractIntent.mockResolvedValue({ type: 'chitchat' })
    const controller = new AbortController()

    await runAndDrain({ messages: USER_MSG, signal: controller.signal })

    const args = mocks.streamText.mock.calls[0][0]
    expect(args.abortSignal).toBe(controller.signal)
  })

  it('forwards request.signal on the clarification branch', async () => {
    mocks.extractIntent.mockResolvedValue({ type: 'clarification' })
    const controller = new AbortController()

    await runAndDrain({ messages: USER_MSG, signal: controller.signal })

    const args = mocks.streamText.mock.calls[0][0]
    expect(args.abortSignal).toBe(controller.signal)
  })

  it('forwards request.signal on the shopping branch (the expensive one)', async () => {
    mocks.extractIntent.mockResolvedValue({
      type: 'shopping',
      query: undefined,
      category: 'smartphones',
      priceMin: undefined,
      priceMax: undefined,
      minRating: undefined,
      sortBy: undefined,
      k: 6,
    })
    mocks.searchAndRank.mockResolvedValue({
      products: [makeProduct()],
      appliedFilters: { sortBy: 'relevance', limit: 6 },
    })
    const controller = new AbortController()

    await runAndDrain({ messages: USER_MSG, signal: controller.signal })

    const args = mocks.streamText.mock.calls[0][0]
    expect(args.abortSignal).toBe(controller.signal)
  })

  it('passes abortSignal=undefined when no signal is provided (no accidental coupling)', async () => {
    mocks.extractIntent.mockResolvedValue({ type: 'chitchat' })

    await runAndDrain({ messages: USER_MSG })

    const args = mocks.streamText.mock.calls[0][0]
    expect(args.abortSignal).toBeUndefined()
  })
})
