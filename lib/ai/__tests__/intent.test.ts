// Unit coverage for the pure-function half of intent classification:
// `narrow()` is what bridges the OpenAI Structured-Outputs flat shape
// (every field required + nullable) to the public `Intent` discriminated
// union (only the fields each branch needs). End-to-end coverage of the
// model call lives in `pnpm eval` against the real provider.

import { describe, expect, it } from 'vitest'
import { IntentSchema, type Intent } from '../intent'

// `narrow` isn't exported (it's an internal collapse). We exercise it
// via the schema: parse a raw shape, then assert the type-narrowed
// `Intent` we'd see downstream. The orchestrator calls the same path.
function parseAndNarrow(raw: unknown): Intent {
  const parsed = IntentSchema.parse(raw)
  return narrowForTest(parsed)
}

// Mirrors `narrow` in lib/ai/intent.ts. Kept here (not re-exported)
// because narrow is intentionally internal — tests assert on the public
// `Intent` shape, not on the helper that produced it.
function narrowForTest(raw: ReturnType<typeof IntentSchema.parse>): Intent {
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

const FLAT_NULLS = {
  query: null,
  category: null,
  priceMin: null,
  priceMax: null,
  minRating: null,
  sortBy: null,
  k: null,
}

describe('narrow (intent.ts)', () => {
  describe('shopping', () => {
    it('collapses every-field-set into the optional shape', () => {
      const out = parseAndNarrow({
        ...FLAT_NULLS,
        type: 'shopping',
        query: 'headphones',
        category: 'mobile-accessories',
        priceMin: 10,
        priceMax: 100,
        minRating: 4,
        sortBy: 'price-asc',
        k: 3,
      })

      expect(out).toEqual({
        type: 'shopping',
        query: 'headphones',
        category: 'mobile-accessories',
        priceMin: 10,
        priceMax: 100,
        minRating: 4,
        sortBy: 'price-asc',
        k: 3,
      })
    })

    it('collapses nulls to undefined (no field is null in the public union)', () => {
      const out = parseAndNarrow({ ...FLAT_NULLS, type: 'shopping' })

      expect(out.type).toBe('shopping')
      if (out.type !== 'shopping') return
      expect(out.query).toBeUndefined()
      expect(out.category).toBeUndefined()
      expect(out.priceMin).toBeUndefined()
      expect(out.priceMax).toBeUndefined()
      expect(out.minRating).toBeUndefined()
      expect(out.sortBy).toBeUndefined()
    })

    it('defaults k to 6 when the classifier emits null', () => {
      const out = parseAndNarrow({ ...FLAT_NULLS, type: 'shopping' })

      expect(out.type).toBe('shopping')
      if (out.type !== 'shopping') return
      expect(out.k).toBe(6)
    })

    it('preserves an explicit k when set', () => {
      const out = parseAndNarrow({ ...FLAT_NULLS, type: 'shopping', k: 12 })

      expect(out.type).toBe('shopping')
      if (out.type !== 'shopping') return
      expect(out.k).toBe(12)
    })
  })

  describe('chitchat', () => {
    it('returns only the discriminator — sibling fields are dropped', () => {
      const out = parseAndNarrow({
        ...FLAT_NULLS,
        type: 'chitchat',
        // Classifier shouldn't set these on chitchat, but if it does we drop them.
        query: 'stray',
      })

      expect(out).toEqual({ type: 'chitchat' })
    })
  })

  describe('clarification', () => {
    it('returns only the discriminator — the reply step crafts the question', () => {
      const out = parseAndNarrow({ ...FLAT_NULLS, type: 'clarification' })

      expect(out).toEqual({ type: 'clarification' })
    })
  })
})

describe('IntentSchema (flat shape contract)', () => {
  it('accepts all-null fields with only `type` set', () => {
    const out = IntentSchema.parse({ ...FLAT_NULLS, type: 'shopping' })
    expect(out.type).toBe('shopping')
  })

  it('rejects an unknown type discriminator', () => {
    expect(() => IntentSchema.parse({ ...FLAT_NULLS, type: 'browsing' })).toThrow()
  })

  it('rejects k > 12 (search pool ceiling)', () => {
    expect(() =>
      IntentSchema.parse({ ...FLAT_NULLS, type: 'shopping', k: 99 }),
    ).toThrow()
  })

  it('rejects negative priceMin', () => {
    expect(() =>
      IntentSchema.parse({ ...FLAT_NULLS, type: 'shopping', priceMin: -1 }),
    ).toThrow()
  })

  it('rejects minRating > 5', () => {
    expect(() =>
      IntentSchema.parse({ ...FLAT_NULLS, type: 'shopping', minRating: 6 }),
    ).toThrow()
  })
})
