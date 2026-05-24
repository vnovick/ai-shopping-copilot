// `formatProductsContext` is what bridges deterministic retrieval into
// the shopping-branch system prompt. The model's reply is forbidden from
// naming products directly (the prompt enforces this); the context block
// is what lets it frame the result accurately without leaking details.
// Shape regressions here are easy to miss because the eval suite skips
// the reply step.

import { describe, expect, it } from 'vitest'
import { formatProductsContext } from '../prompts'
import type { Product } from '@/lib/products/types'
import type { AppliedFilters } from '@/lib/products/search'

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 0,
    title: 'placeholder',
    description: '',
    category: 'misc',
    price: 0,
    discountPercentage: 0,
    rating: 0,
    brand: '',
    stock: 10,
    thumbnail: '',
    images: [],
    availabilityStatus: '',
    ...overrides,
  }
}

const NO_FILTERS: AppliedFilters = {
  sortBy: 'relevance',
  limit: 6,
}

describe('formatProductsContext', () => {
  it('renders the "no results" branch when the products list is empty', () => {
    const ctx = formatProductsContext([], NO_FILTERS)

    expect(ctx).toContain('RETRIEVED PRODUCTS: none.')
    // Filters still serialised — the model uses them to suggest refinements.
    expect(ctx).toContain('Applied filters:')
    expect(ctx).toContain('"sortBy":"relevance"')
  })

  it('renders one bullet per product with category, price (2dp), and rating (1dp)', () => {
    const products = [
      makeProduct({ id: 1, title: 'iPhone 16', category: 'smartphones', price: 999, rating: 4.5 }),
      makeProduct({ id: 2, title: 'Air Buds', category: 'mobile-accessories', price: 49.5, rating: 3 }),
    ]

    const ctx = formatProductsContext(products, NO_FILTERS)

    expect(ctx).toContain('- iPhone 16 (smartphones, $999.00, rating 4.5)')
    expect(ctx).toContain('- Air Buds (mobile-accessories, $49.50, rating 3.0)')
  })

  it("falls back to 'uncategorized' when a product has an empty category", () => {
    const ctx = formatProductsContext(
      [makeProduct({ id: 3, title: 'Mystery', category: '', price: 1, rating: 1 })],
      NO_FILTERS,
    )

    expect(ctx).toContain('(uncategorized, $1.00, rating 1.0)')
  })

  it('includes the "do not repeat in your reply" instruction so the model knows the context is private', () => {
    const ctx = formatProductsContext(
      [makeProduct({ id: 4, title: 'Anything', price: 1, rating: 1 })],
      NO_FILTERS,
    )

    expect(ctx).toMatch(/do not repeat any of these in your reply/i)
  })

  it('serialises every applied filter back into the context', () => {
    const filters: AppliedFilters = {
      query: 'headphones',
      category: 'mobile-accessories',
      priceMin: 10,
      priceMax: 100,
      minRating: 4,
      sortBy: 'price-asc',
      limit: 3,
    }

    const ctx = formatProductsContext([], filters)

    expect(ctx).toContain('"query":"headphones"')
    expect(ctx).toContain('"category":"mobile-accessories"')
    expect(ctx).toContain('"priceMin":10')
    expect(ctx).toContain('"priceMax":100')
    expect(ctx).toContain('"minRating":4')
    expect(ctx).toContain('"sortBy":"price-asc"')
    expect(ctx).toContain('"limit":3')
  })
})
