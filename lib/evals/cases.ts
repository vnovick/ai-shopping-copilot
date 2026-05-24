import {
  firstResultRating,
  intentTypeWas,
  productsCount,
  shoppingArgsMatch,
  textContainsApology,
  textHasNoMarkdown,
  textIsConcise,
  textIsQuestion,
  textMentionsAnyProductTitle,
  textSteersToShopping,
  uniqueProductIds,
  type IntentTurn,
} from './assertions'

// Re-used by every shopping case: the prompt forbids product titles,
// markdown, and runaway length in the reply. Bundling here keeps cases
// readable and the rule edit-once.
const shoppingTextRules: EvalCase['assertions'] = [
  {
    name: 'reply does NOT name any retrieved product (hallucination guard)',
    check: (t) => !textMentionsAnyProductTitle(t),
  },
  {
    name: 'reply has no markdown formatting',
    check: (t) => textHasNoMarkdown(t),
  },
  {
    name: 'reply is concise (≤3 sentences)',
    check: (t) => textIsConcise(t, 3),
  },
]

export type EvalCase = {
  name: string
  messages: Array<{ role: 'user' | 'assistant'; text: string }>
  assertions: Array<{ name: string; check: (turn: IntentTurn) => boolean }>
}

export const evalCases: EvalCase[] = [
  {
    name: '01 — wireless headphones under $100',
    messages: [{ role: 'user', text: 'I want wireless headphones under $100' }],
    assertions: [
      {
        name: 'intent=shopping with priceMax<=100 and headphones-ish query',
        check: (t) =>
          shoppingArgsMatch(
            t,
            (i) =>
              (i.priceMax ?? Infinity) <= 100 &&
              `${i.query ?? ''} ${i.category ?? ''}`
                .toLowerCase()
                .includes('headphone'),
          ),
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '02 — beauty products',
    messages: [{ role: 'user', text: 'Show me beauty products' }],
    assertions: [
      {
        name: 'intent=shopping with category ~ beauty',
        check: (t) =>
          shoppingArgsMatch(t, (i) =>
            (i.category ?? '').toLowerCase().includes('beaut'),
          ),
      },
      { name: 'returns at least one product', check: (t) => productsCount(t) > 0 },
      ...shoppingTextRules,
    ],
  },
  {
    name: '03 — recommend a phone',
    messages: [{ role: 'user', text: 'Recommend a phone' }],
    assertions: [
      { name: 'intent=shopping', check: (t) => intentTypeWas(t, 'shopping') },
      { name: 'returns at least one product', check: (t) => productsCount(t) > 0 },
      ...shoppingTextRules,
    ],
  },
  {
    name: '04 — cheapest laptop',
    messages: [{ role: 'user', text: "What's the cheapest laptop?" }],
    assertions: [
      {
        name: 'sortBy=price-asc',
        check: (t) => shoppingArgsMatch(t, (i) => i.sortBy === 'price-asc'),
      },
      {
        name: 'intent mentions laptops (query or category)',
        check: (t) =>
          shoppingArgsMatch(t, (i) =>
            `${i.query ?? ''} ${i.category ?? ''}`.toLowerCase().includes('laptop'),
          ),
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '05 — highly rated skincare',
    messages: [{ role: 'user', text: 'Highly rated skincare' }],
    assertions: [
      {
        name: 'sortBy=rating-desc + category ~ beauty/skincare',
        check: (t) =>
          shoppingArgsMatch(t, (i) => {
            const cat = (i.category ?? '').toLowerCase()
            return (
              i.sortBy === 'rating-desc' &&
              (cat.includes('beaut') || cat.includes('skin'))
            )
          }),
      },
      // Soft: if anything came back, the top entry should have a rating
      // (i.e. sorting worked). Empty results aren't a model bug — they're
      // a DummyJSON coverage issue.
      {
        name: 'if non-empty, top product has a numeric rating',
        check: (t) =>
          productsCount(t) === 0 || typeof firstResultRating(t) === 'number',
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '06 — empty result for nonsense query',
    messages: [{ role: 'user', text: 'Purple unicorn dancing shoes' }],
    assertions: [
      { name: 'intent=shopping', check: (t) => intentTypeWas(t, 'shopping') },
      {
        name: 'product count is zero',
        check: (t) => productsCount(t) === 0,
      },
      // Empty-result branch of the shopping prompt: model must apologise +
      // suggest a refinement. Hallucination + markdown rules still apply.
      {
        name: 'reply contains an apology / "no matches" framing',
        check: (t) => textContainsApology(t),
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '07 — follow-up: the cheapest two',
    messages: [
      { role: 'user', text: 'I want wireless headphones under $100' },
      { role: 'assistant', text: 'Here are a few options.' },
      { role: 'user', text: 'show me the cheapest two' },
    ],
    assertions: [
      {
        name: 'sortBy=price-asc and k<=2',
        check: (t) =>
          shoppingArgsMatch(t, (i) => i.sortBy === 'price-asc' && (i.k ?? 6) <= 2),
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '08 — off-topic: weather',
    messages: [{ role: 'user', text: "What's the weather?" }],
    assertions: [
      {
        name: 'intent=chitchat (no retrieval)',
        check: (t) => intentTypeWas(t, 'chitchat'),
      },
      // Chitchat prompt: one short sentence + steer back to shopping.
      {
        name: 'reply steers back to shopping',
        check: (t) => textSteersToShopping(t),
      },
      {
        name: 'reply is concise (≤2 sentences for chitchat)',
        check: (t) => textIsConcise(t, 2),
      },
      {
        name: 'reply has no markdown formatting',
        check: (t) => textHasNoMarkdown(t),
      },
    ],
  },
  {
    name: '09 — hallucination check (no IDs in extraction)',
    messages: [{ role: 'user', text: 'Tell me about product 5' }],
    assertions: [
      // The model should treat this as a (vague) shopping intent — there's
      // no "id" field in the schema, so it can't fabricate IDs into the
      // structured output. This is the structural guard the design rests on.
      { name: 'intent=shopping or clarification (never invents an id field)',
        check: (t) =>
          intentTypeWas(t, 'shopping') || intentTypeWas(t, 'clarification'),
      },
      // Whichever branch it picks, the reply must not name a retrieved
      // product (the hallucination guardrail is branch-independent for
      // shopping; clarification reply has no products to leak anyway).
      {
        name: 'reply does NOT leak a retrieved product title',
        check: (t) => !textMentionsAnyProductTitle(t),
      },
      {
        name: 'reply has no markdown formatting',
        check: (t) => textHasNoMarkdown(t),
      },
    ],
  },
  {
    name: '10 — follow-up: which is the best (carries forward budget + sorts by rating)',
    messages: [
      { role: 'user', text: 'suggest less than $300 smartphone' },
      {
        role: 'assistant',
        text: 'Here are a few smartphone options under $300 — if you want, I can narrow it down by rating, brand, or cheapest picks.',
      },
      { role: 'user', text: 'which one is the best' },
    ],
    assertions: [
      { name: 'intent=shopping', check: (t) => intentTypeWas(t, 'shopping') },
      {
        name: 'sortBy=rating-desc',
        check: (t) => shoppingArgsMatch(t, (i) => i.sortBy === 'rating-desc'),
      },
      {
        name: 'carries forward priceMax <= 300',
        check: (t) => shoppingArgsMatch(t, (i) => (i.priceMax ?? Infinity) <= 300),
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '11 — follow-up: I want the cheapest (carries forward budget + sorts by price)',
    messages: [
      { role: 'user', text: 'suggest less than $300 smartphone' },
      {
        role: 'assistant',
        text: 'Here are a few smartphone options under $300 — if you want, I can narrow it down by rating, brand, or cheapest picks.',
      },
      { role: 'user', text: 'I want the cheapest' },
    ],
    assertions: [
      { name: 'intent=shopping', check: (t) => intentTypeWas(t, 'shopping') },
      {
        name: 'sortBy=price-asc',
        check: (t) => shoppingArgsMatch(t, (i) => i.sortBy === 'price-asc'),
      },
      {
        name: 'carries forward priceMax <= 300',
        check: (t) => shoppingArgsMatch(t, (i) => (i.priceMax ?? Infinity) <= 300),
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '12 — follow-up: cross-category find (drops bad category on retry)',
    messages: [
      { role: 'user', text: 'do you have selfie sticks for smartphones?' },
      {
        role: 'assistant',
        text: "Sorry, I couldn't find any selfie sticks in the current catalogue; try searching accessories or a related term like tripods or phone mounts.",
      },
      { role: 'user', text: "maybe it's in a different category?" },
    ],
    assertions: [
      { name: 'intent=shopping', check: (t) => intentTypeWas(t, 'shopping') },
      {
        name: 'query mentions selfie',
        check: (t) =>
          shoppingArgsMatch(t, (i) =>
            (i.query ?? '').toLowerCase().includes('selfie'),
          ),
      },
      {
        name: 'category constraint dropped on retry',
        check: (t) =>
          shoppingArgsMatch(t, (i) => !i.category || i.category.trim() === ''),
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '13 — show me a few smartphones to compare',
    messages: [
      { role: 'user', text: 'Show me a few smartphones I can compare' },
    ],
    assertions: [
      { name: 'intent=shopping', check: (t) => intentTypeWas(t, 'shopping') },
      {
        name: 'intent targets the smartphones category (or query)',
        check: (t) =>
          shoppingArgsMatch(t, (i) =>
            `${i.category ?? ''} ${i.query ?? ''}`
              .toLowerCase()
              .includes('smartphone'),
          ),
      },
      {
        name: 'at least 2 distinct products returned',
        check: (t) => uniqueProductIds(t).length >= 2,
      },
      ...shoppingTextRules,
    ],
  },
  {
    name: '14 — chitchat: hello',
    messages: [{ role: 'user', text: 'Hello there!' }],
    assertions: [
      {
        name: 'intent=chitchat (no retrieval triggered)',
        check: (t) => intentTypeWas(t, 'chitchat'),
      },
      { name: 'no products surfaced', check: (t) => productsCount(t) === 0 },
      {
        name: 'reply steers back to shopping',
        check: (t) => textSteersToShopping(t),
      },
      {
        name: 'reply is concise (≤2 sentences)',
        check: (t) => textIsConcise(t, 2),
      },
    ],
  },
  {
    name: '15 — clarification: vague gift ask',
    messages: [{ role: 'user', text: 'I want a gift' }],
    assertions: [
      {
        name: 'intent=clarification',
        check: (t) => t.intent.type === 'clarification',
      },
      { name: 'no products surfaced', check: (t) => productsCount(t) === 0 },
      // Clarification prompt asks for exactly one short clarifying
      // question — the reply must end with a question mark.
      {
        name: 'reply ends with a question mark',
        check: (t) => textIsQuestion(t),
      },
      {
        name: 'reply is concise (≤2 sentences)',
        check: (t) => textIsConcise(t, 2),
      },
      {
        name: 'reply has no markdown formatting',
        check: (t) => textHasNoMarkdown(t),
      },
    ],
  },
]
