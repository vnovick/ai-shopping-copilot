// Defensive backstop for the LLM slips the classifier prompt can't
// catch — chiefly that the classifier doesn't get the slug list, so it
// can't verify the categories it emits are real. Exact-match only;
// colloquial/plural normalisation lives in the classifier prompt.

import { fetchCategories } from './client'
import type { SearchInput, SortBy } from './search'

export type NormalizedSearchInput = {
  query?: string
  category?: string
  priceMin?: number
  priceMax?: number
  minRating?: number
  sortBy: SortBy
  limit: number
}

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 12

export async function normalizeSearchInput(
  input: SearchInput,
): Promise<NormalizedSearchInput> {
  // One cached fetch up front so the helpers stay pure-sync. Empty list
  // on failure = degraded state (invalid category dropped, query kept).
  const known = await fetchCategories().catch(() => [] as string[])

  // Drop invented category slugs ("electronics", "audio").
  const validCategory = resolveCategory(input.category, known)

  // Drop a query that literally restates the category — without this
  // the in-category substring filter would wipe the pool.
  const queryAfterCategory =
    validCategory && input.query && queryNamesCategory(input.query, validCategory)
      ? undefined
      : input.query

  // Promote a query that *is* a known slug ("beauty") to a category,
  // so we hit /products/category/beauty instead of /search?q=beauty
  // (which would pull anything mentioning the word).
  const queryAsCategory = validCategory
    ? undefined
    : categoryFromQuery(queryAfterCategory, known)

  return {
    query: queryAsCategory ? undefined : queryAfterCategory,
    category: validCategory ?? queryAsCategory,
    priceMin: nonZero(input.priceMin),
    priceMax: nonZero(input.priceMax),
    minRating: nonZero(input.minRating),
    sortBy: input.sortBy ?? 'relevance',
    limit: clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT),
  }
}

function resolveCategory(raw: string | undefined, known: string[]): string | undefined {
  if (!raw) return undefined
  const slug = raw.toLowerCase().trim()
  return known.includes(slug) ? slug : undefined
}

function queryNamesCategory(query: string, category: string): boolean {
  return query.toLowerCase().trim() === category.toLowerCase()
}

function categoryFromQuery(
  query: string | undefined,
  known: string[],
): string | undefined {
  if (!query) return undefined
  const q = query.toLowerCase().trim()
  return known.includes(q) ? q : undefined
}

// `0` from the model means "no minimum" — normalise so we don't claim
// a constraint we didn't actually impose.
function nonZero(n: number | undefined): number | undefined {
  return n == null || n === 0 ? undefined : n
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}
