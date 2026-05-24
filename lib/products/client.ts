import createClient from 'openapi-fetch'
import type { paths } from './openapi-types'
import { tryMapProduct, type DummyProduct, type Product } from './types'

// Normalises a DummyJSON product list response: missing list → [],
// malformed rows logged + dropped (see `tryMapProduct`).
function toProducts(raw: DummyProduct[] | undefined): Product[] {
  return (raw ?? []).flatMap((r) => {
    const p = tryMapProduct(r)
    return p ? [p] : []
  })
}

// One helper for every `dummyJsonClient.GET` that returns a products
// list. Threads the error → throw → map → normalize pipeline through
// a single call site so each endpoint becomes one line.
async function runProductsRequest<T extends { products?: DummyProduct[] }>(
  request: () => Promise<{ data?: T; error?: unknown }>,
  errorLabel: string,
): Promise<Product[]> {
  const { data, error } = await request()
  if (error) throw new Error(errorLabel)
  return toProducts(data?.products)
}

export const dummyJsonClient = createClient<paths>({
  baseUrl: 'https://dummyjson.com',
  // Force a fresh lookup of `globalThis.fetch` per call so tests can stub it
  // via vi.spyOn after the module has loaded.
  fetch: (...args) => globalThis.fetch(...args),
})

type FetchProductsArgs = {
  q?: string
  category?: string
  limit?: number
  skip?: number
  // DummyJSON sort: pass the raw field name ("price", "rating", "title")
  // and order ("asc" | "desc"). All three list endpoints accept them —
  // upstream only documents sort on /products, but the spec in this repo
  // is annotated for the other two from empirical verification.
  sortBy?: string
  order?: 'asc' | 'desc'
}

export async function fetchProducts({
  q,
  category,
  limit,
  skip,
  sortBy,
  order,
}: FetchProductsArgs = {}): Promise<Product[]> {
  // Precedence: an explicit query wins. DummyJSON has no "search within a
  // category" endpoint — we have to pick one. The user's literal search
  // string is a stronger signal than a category (which the model often
  // carries forward from a previous turn).
  if (q) {
    const primary = await searchByQuery(q, limit, skip, sortBy, order)
    if (primary.length > 0) return primary
    // DummyJSON's /products/search is a literal substring match — no
    // stemming. Retry the singular/plural twin so "selfie sticks" can
    // still find "Selfie Stick Monopod" (and vice versa).
    const alt = togglePlural(q)
    if (alt === q) return primary
    return searchByQuery(alt, limit, skip, sortBy, order)
  }

  if (category) {
    return runProductsRequest(
      () =>
        dummyJsonClient.GET('/products/category/{slug}', {
          params: { path: { slug: category }, query: { limit, skip, sortBy, order } },
        }),
      `DummyJSON category fetch failed: ${category}`,
    )
  }

  return runProductsRequest(
    () => dummyJsonClient.GET('/products', { params: { query: { limit, skip, sortBy, order } } }),
    'DummyJSON list fetch failed',
  )
}

async function searchByQuery(
  q: string,
  limit: number | undefined,
  skip: number | undefined,
  sortBy: string | undefined,
  order: 'asc' | 'desc' | undefined,
): Promise<Product[]> {
  return runProductsRequest(
    () =>
      dummyJsonClient.GET('/products/search', {
        params: { query: { q, limit, skip, sortBy, order } },
      }),
    `DummyJSON search failed: ${q}`,
  )
}

function togglePlural(s: string): string {
  const t = s.trim()
  if (!t) return t
  return t.endsWith('s') ? t.slice(0, -1) : `${t}s`
}

// 5-minute in-process cache. Fine for one Node process; revisit on a
// multi-instance deploy.
type CategoriesCache = { value: string[]; at: number }
let categoriesCache: CategoriesCache | null = null
const CATEGORIES_TTL_MS = 5 * 60 * 1000

export async function fetchCategories(): Promise<string[]> {
  if (categoriesCache && Date.now() - categoriesCache.at < CATEGORIES_TTL_MS) {
    return categoriesCache.value
  }
  // `/products/category-list` returns a plain `string[]` of slugs — exactly
  // what we want, no `{slug,name,url}` unwrap needed. The heavier
  // `/products/categories` carries name + URL we don't use.
  const { data, error } = await dummyJsonClient.GET('/products/category-list')
  if (error) throw new Error('DummyJSON categories fetch failed')
  const slugs = (data ?? []).filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  )

  categoriesCache = { value: slugs, at: Date.now() }
  return slugs
}

export function resetCategoriesCacheForTests(): void {
  categoriesCache = null
}
