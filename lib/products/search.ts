import { fetchProducts } from './client'
import { normalizeSearchInput, type NormalizedSearchInput } from './normalize-input'
import type { Product } from './types'

export type SortBy = 'relevance' | 'price-asc' | 'price-desc' | 'rating-desc'

export type SearchInput = {
  query?: string
  category?: string
  priceMin?: number
  priceMax?: number
  minRating?: number
  sortBy?: SortBy
  limit?: number
}

export type AppliedFilters = {
  query?: string
  category?: string
  priceMin?: number
  priceMax?: number
  minRating?: number
  sortBy: SortBy
  limit: number
}

export type SearchResult = {
  products: Product[]
  appliedFilters: AppliedFilters
}

// Fetch broader than the user-facing limit so the in-memory filter has
// material to work with — DummyJSON doesn't filter by price/rating.
const FETCH_POOL = 30

export async function searchAndRank(raw: SearchInput): Promise<SearchResult> {
  const input = await normalizeSearchInput(raw)
  const { pool, appliedCategory } = await retrievePool(input)
  // Sort is server-side now — pool comes back in the requested order. The
  // in-memory filter only removes items (price/rating); order is preserved.
  const products = pool.filter((p) => matchesFilters(p, input)).slice(0, input.limit)

  return {
    products,
    appliedFilters: {
      query: input.query,
      category: appliedCategory,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      minRating: input.minRating,
      sortBy: input.sortBy,
      limit: input.limit,
    },
  }
}

// Routing strategy:
//  - category + query → fetch the category, filter by query in memory
//    ("search within category"); fall back to a query-only search if no
//    in-category match (rescues a stale category from a previous turn — we
//    drop the category from `appliedCategory` so the badge row doesn't lie).
//  - category only    → fetch the category.
//  - query only       → /products/search (retry inside fetchProducts).
//  - neither          → list endpoint.
async function retrievePool(
  input: NormalizedSearchInput,
): Promise<{ pool: Product[]; appliedCategory?: string }> {
  const sort = toDummyJsonSort(input.sortBy)

  if (input.category) {
    const categoryPool = await fetchProducts({
      category: input.category,
      limit: FETCH_POOL,
      ...sort,
    })
    if (!input.query) return { pool: categoryPool, appliedCategory: input.category }

    const inCategory = filterByText(categoryPool, input.query)
    if (inCategory.length > 0) {
      return { pool: inCategory, appliedCategory: input.category }
    }
    const fallback = await fetchProducts({ q: input.query, limit: FETCH_POOL, ...sort })
    return { pool: fallback, appliedCategory: undefined }
  }

  if (input.query) {
    return {
      pool: await fetchProducts({ q: input.query, limit: FETCH_POOL, ...sort }),
      appliedCategory: undefined,
    }
  }

  return {
    pool: await fetchProducts({ limit: FETCH_POOL, ...sort }),
    appliedCategory: undefined,
  }
}

// Map our public sort enum to DummyJSON's `{ sortBy, order }` shape.
// 'relevance' deliberately returns no params — for /search that means
// DummyJSON's own match-quality ordering; for /category and the default
// list it means insertion order (the catalogue default).
function toDummyJsonSort(sortBy: SortBy): { sortBy?: string; order?: 'asc' | 'desc' } {
  switch (sortBy) {
    case 'price-asc':
      return { sortBy: 'price', order: 'asc' }
    case 'price-desc':
      return { sortBy: 'price', order: 'desc' }
    case 'rating-desc':
      return { sortBy: 'rating', order: 'desc' }
    case 'relevance':
      return {}
  }
}

function matchesFilters(p: Product, input: NormalizedSearchInput): boolean {
  if (input.priceMin != null && p.price < input.priceMin) return false
  if (input.priceMax != null && p.price > input.priceMax) return false
  if (input.minRating != null && p.rating < input.minRating) return false
  return true
}

function filterByText(products: Product[], query: string): Product[] {
  const q = query.toLowerCase()
  return products.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q),
  )
}
