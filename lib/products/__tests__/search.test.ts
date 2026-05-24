import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../client', () => ({
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
}))

import { fetchCategories, fetchProducts } from '../client'
import { searchAndRank } from '../search'
import type { Product } from '../types'

const KNOWN_CATEGORIES = ['smartphones', 'laptops', 'beauty', 'fragrances']

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 0,
    title: `Product ${overrides.id ?? 0}`,
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

const pool: Product[] = [
  makeProduct({ id: 1, price: 10, rating: 4.5 }),
  makeProduct({ id: 2, price: 50, rating: 3.5 }),
  makeProduct({ id: 3, price: 100, rating: 4.9 }),
  makeProduct({ id: 4, price: 200, rating: 2.1 }),
  makeProduct({ id: 5, price: 25, rating: 4.0 }),
]

beforeEach(() => {
  vi.mocked(fetchProducts).mockReset()
  vi.mocked(fetchProducts).mockResolvedValue(pool)
  vi.mocked(fetchCategories).mockReset()
  vi.mocked(fetchCategories).mockResolvedValue(KNOWN_CATEGORIES)
})

describe('searchAndRank', () => {
  it('returns all matching products up to default limit of 6', async () => {
    const { products } = await searchAndRank({})
    expect(products).toHaveLength(5)
  })

  it('clamps limit to 1..12', async () => {
    const high = await searchAndRank({ limit: 999 })
    expect(high.appliedFilters.limit).toBe(12)
    const low = await searchAndRank({ limit: 0 })
    expect(low.appliedFilters.limit).toBe(1)
  })

  it('filters by priceMin', async () => {
    const { products } = await searchAndRank({ priceMin: 50 })
    expect(products.map((p) => p.id).sort()).toEqual([2, 3, 4])
  })

  it('filters by priceMax', async () => {
    const { products } = await searchAndRank({ priceMax: 50 })
    expect(products.map((p) => p.id).sort()).toEqual([1, 2, 5])
  })

  it('filters by minRating', async () => {
    const { products } = await searchAndRank({ minRating: 4 })
    expect(products.map((p) => p.id).sort()).toEqual([1, 3, 5])
  })

  // Sort is delegated to DummyJSON via the `sortBy`/`order` query params.
  // These tests assert we ASK the API to sort correctly; verifying that
  // DummyJSON actually honours the request is upstream's responsibility
  // (and is empirically covered by the eval suite hitting the real API).
  it('passes price-asc sort to the API', async () => {
    await searchAndRank({ sortBy: 'price-asc' })
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'price', order: 'asc' }),
    )
  })

  it('passes price-desc sort to the API', async () => {
    await searchAndRank({ sortBy: 'price-desc' })
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'price', order: 'desc' }),
    )
  })

  it('passes rating-desc sort to the API', async () => {
    await searchAndRank({ sortBy: 'rating-desc' })
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'rating', order: 'desc' }),
    )
  })

  it('omits sortBy/order from the API call for relevance (default)', async () => {
    await searchAndRank({})
    const call = vi.mocked(fetchProducts).mock.calls[0]?.[0] ?? {}
    expect(call.sortBy).toBeUndefined()
    expect(call.order).toBeUndefined()
  })

  it('returns an empty list when nothing matches', async () => {
    const { products } = await searchAndRank({ priceMin: 1_000 })
    expect(products).toHaveLength(0)
  })

  it('reports the applied filters back', async () => {
    const { appliedFilters } = await searchAndRank({
      query: 'foo',
      priceMax: 50,
      sortBy: 'price-asc',
      limit: 3,
    })
    expect(appliedFilters).toEqual({
      query: 'foo',
      category: undefined,
      priceMin: undefined,
      priceMax: 50,
      minRating: undefined,
      sortBy: 'price-asc',
      limit: 3,
    })
  })

  it('searches within a category when both query and category are given (no fallback when match found)', async () => {
    const { appliedFilters } = await searchAndRank({
      query: 'product 1', // matches the title "Product 1" in our pool
      category: 'smartphones',
    })

    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'smartphones' }),
    )
    expect(appliedFilters.category).toBe('smartphones')
    expect(appliedFilters.query).toBe('product 1')
  })

  it('drops a redundant query that just names the category ("smartphones" + smartphones)', async () => {
    const { products, appliedFilters } = await searchAndRank({
      query: 'smartphones',
      category: 'smartphones',
    })

    // Only one fetch — the category — because the redundant query was dropped
    // before the in-memory filter would have wiped the pool to zero.
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'smartphones' }),
    )
    expect(products).toHaveLength(5)
    expect(appliedFilters.category).toBe('smartphones')
    expect(appliedFilters.query).toBeUndefined()
  })

  it('falls back to query-only search when the query has no in-category match (drops stale category)', async () => {
    // Pool products are all named "Product N", none of which contain
    // "moisturiser" — in-category filter is empty, fallback fires.
    const { appliedFilters } = await searchAndRank({
      query: 'moisturiser',
      category: 'smartphones',
    })

    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'moisturiser' }),
    )
    // We dropped the category because it didn't end up filtering anything.
    expect(appliedFilters.category).toBeUndefined()
  })

  it('promotes an exact-match category query ("beauty")', async () => {
    const { appliedFilters } = await searchAndRank({ query: 'beauty' })
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'beauty' }),
    )
    expect(appliedFilters.category).toBe('beauty')
  })

  it('does not promote a query that is not a known category ("Oppo K1") — uses /search', async () => {
    await searchAndRank({ query: 'Oppo K1' })
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Oppo K1' }),
    )
  })

  it('still uses the category endpoint when only category is given', async () => {
    await searchAndRank({ category: 'beauty' })
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'beauty' }),
    )
  })

  it('drops an unknown category slug rather than hitting DummyJSON with it', async () => {
    const { appliedFilters } = await searchAndRank({ category: 'electronics' })
    expect(vi.mocked(fetchProducts)).not.toHaveBeenCalledWith(
      expect.objectContaining({ category: 'electronics' }),
    )
    expect(appliedFilters.category).toBeUndefined()
  })

  // If DummyJSON's /products/category-list is down, normalize-input
  // must not throw out of the stream — empty known list = degraded
  // state (invalid category dropped, query stays, search proceeds).
  it('degrades gracefully when fetchCategories throws (empty known list)', async () => {
    vi.mocked(fetchCategories).mockRejectedValueOnce(new Error('upstream down'))

    const result = await searchAndRank({
      query: 'wireless headphones',
      category: 'smartphones',
    })

    // category dropped (we have no list to validate against), query preserved
    expect(result.appliedFilters.category).toBeUndefined()
    expect(result.appliedFilters.query).toBe('wireless headphones')
    // search still hit DummyJSON via the query path
    expect(vi.mocked(fetchProducts)).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'wireless headphones' }),
    )
  })

  it('treats priceMin=0 and minRating=0 as no constraint', async () => {
    const { appliedFilters, products } = await searchAndRank({
      priceMin: 0,
      minRating: 0,
    })
    expect(appliedFilters.priceMin).toBeUndefined()
    expect(appliedFilters.minRating).toBeUndefined()
    expect(products).toHaveLength(5) // whole pool, nothing filtered out
  })
})
