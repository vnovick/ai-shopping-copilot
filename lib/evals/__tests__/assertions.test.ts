// Pure-function pinning for the text assertions. These functions are
// what the eval suite uses to grade real model output — if the regex
// drifts, the suite silently passes or fails for the wrong reason.

import { describe, expect, it } from 'vitest'
import {
  textContainsApology,
  textHasNoMarkdown,
  textIsConcise,
  textIsQuestion,
  textMentionsAnyProductTitle,
  textSteersToShopping,
} from '../assertions'
import type { IntentTurn } from '../assertions'

function turn(text: string, products: IntentTurn['products'] = []): IntentTurn {
  return { intent: { type: 'chitchat' }, products, text }
}

describe('textSteersToShopping', () => {
  it.each([
    'Hello! How can I help with your shopping today?',
    'Let me know what you’re looking for.',
    'Want me to help you find a fragrance?',
    'I can show you products in any category.',
    'Try browsing the catalogue first.',
    'Catalogue is available — what category?',
  ])('matches %j', (text) => {
    expect(textSteersToShopping(turn(text))).toBe(true)
  })

  it.each([
    'It is sunny today.',
    'I cannot help with that.',
    'Sure thing!',
    '',
  ])('does NOT match %j', (text) => {
    expect(textSteersToShopping(turn(text))).toBe(false)
  })

  it('does not false-positive on unrelated words containing "shop" (e.g. "workshop")', () => {
    expect(textSteersToShopping(turn('I attended a workshop yesterday.'))).toBe(false)
  })
})

describe('textContainsApology', () => {
  it.each(['Sorry, no matches.', "I'm sorry — try again.", "Couldn't find anything.", 'No results for that query.'])(
    'matches %j',
    (text) => {
      expect(textContainsApology(turn(text))).toBe(true)
    },
  )

  it('does not match a confident reply', () => {
    expect(textContainsApology(turn('Here are a few options under $100.'))).toBe(false)
  })
})

describe('textIsQuestion', () => {
  it('matches a sentence ending in "?"', () => {
    expect(textIsQuestion(turn('What category were you thinking?'))).toBe(true)
  })

  it('matches with trailing emoji / whitespace', () => {
    expect(textIsQuestion(turn('Which one looks right?  '))).toBe(true)
  })

  it('does not match a statement', () => {
    expect(textIsQuestion(turn('Here are some options.'))).toBe(false)
  })
})

describe('textIsConcise', () => {
  it('accepts a one-sentence reply', () => {
    expect(textIsConcise(turn('Here are a few picks.'))).toBe(true)
  })

  it('rejects a four-sentence reply at the default cap (3)', () => {
    expect(textIsConcise(turn('One. Two. Three. Four.'))).toBe(false)
  })

  it('respects a custom cap', () => {
    expect(textIsConcise(turn('One. Two. Three.'), 2)).toBe(false)
    expect(textIsConcise(turn('One. Two.'), 2)).toBe(true)
  })
})

describe('textHasNoMarkdown', () => {
  it('passes plain prose', () => {
    expect(textHasNoMarkdown(turn('Here are some options under $50.'))).toBe(true)
  })

  it.each([
    '**bold here**',
    '## Heading',
    '- bullet item\n- another',
    'see [the docs](https://example.com)',
  ])('flags %j', (text) => {
    expect(textHasNoMarkdown(turn(text))).toBe(false)
  })
})

describe('textMentionsAnyProductTitle', () => {
  it('detects a substring match (case-insensitive)', () => {
    expect(
      textMentionsAnyProductTitle(
        turn("Dior J'adore is a great pick.", [
          {
            id: 1,
            title: "Dior J'adore",
            description: '',
            category: 'fragrances',
            price: 80,
            discountPercentage: 0,
            rating: 4,
            brand: 'Dior',
            stock: 1,
            thumbnail: '',
            images: [],
            availabilityStatus: '',
          },
        ]),
      ),
    ).toBe(true)
  })

  it('returns false when products is empty (no titles to mention)', () => {
    expect(textMentionsAnyProductTitle(turn("Dior J'adore is a great pick."))).toBe(false)
  })
})
