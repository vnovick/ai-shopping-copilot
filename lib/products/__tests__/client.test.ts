import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import productsFixture from '../../../tests/fixtures/products.json'
import {
  fetchCategories,
  fetchProducts,
  resetCategoriesCacheForTests,
} from '../client'

// We stub globalThis.fetch directly here — openapi-fetch's request shape
// doesn't reliably trip MSW's interception in this Node version, so direct
// stubbing gives us a clean URL contract test without the MSW indirection.
let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetCategoriesCacheForTests()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
})

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function lastFetchUrl(): string {
  const call = fetchSpy.mock.calls.at(-1)?.[0]
  return typeof call === 'string'
    ? call
    : call instanceof URL
      ? call.toString()
      : (call as Request).url
}

function fetchUrlAt(n: number): string {
  const call = fetchSpy.mock.calls.at(n)?.[0]
  return typeof call === 'string'
    ? call
    : call instanceof URL
      ? call.toString()
      : (call as Request).url
}

function decodedQ(url: string): string | undefined {
  const match = url.match(/[?&]q=([^&]+)/)
  if (!match) return undefined
  return decodeURIComponent(match[1].replace(/\+/g, ' '))
}

describe('products/client', () => {
  it('hits /products and parses the products array', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ products: productsFixture, total: 12, skip: 0, limit: 12 }),
    )

    const products = await fetchProducts({ limit: 12 })

    expect(products).toHaveLength(12)
    expect(lastFetchUrl()).toContain('/products')
    expect(lastFetchUrl()).toContain('limit=12')
  })

  it('routes category queries to /products/category/{slug}', async () => {
    const beauty = productsFixture.filter((p) => p.category === 'beauty')
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ products: beauty, total: beauty.length, skip: 0, limit: beauty.length }),
    )

    const products = await fetchProducts({ category: 'beauty' })

    expect(products.length).toBe(beauty.length)
    expect(products.every((p) => p.category === 'beauty')).toBe(true)
    expect(lastFetchUrl()).toContain('/products/category/beauty')
  })

  it('routes free-text queries to /products/search?q=...', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        products: productsFixture.slice(0, 3),
        total: 3,
        skip: 0,
        limit: 3,
      }),
    )

    const products = await fetchProducts({ q: 'mascara' })

    expect(products).toHaveLength(3)
    expect(lastFetchUrl()).toContain('/products/search')
    expect(lastFetchUrl()).toContain('q=mascara')
  })

  it('throws on non-2xx responses', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    await expect(fetchProducts()).rejects.toThrow()
  })

  it('hits /products/category-list and parses a plain string[]', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(['beauty', 'smartphones', 'laptops']))

    const slugs = await fetchCategories()

    expect(slugs).toEqual(['beauty', 'smartphones', 'laptops'])
    expect(lastFetchUrl()).toContain('/products/category-list')
  })

  it('caches categories within the TTL', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(['beauty']))

    const first = await fetchCategories()
    const second = await fetchCategories()

    expect(second).toBe(first) // same array reference, served from cache
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // DummyJSON's /products/search is a literal substring match — no
  // stemming. `fetchProducts` rescues callers by retrying the
  // singular/plural twin when the first attempt comes back empty.
  describe('singular/plural retry on /search', () => {
    it('retries with the singular form when a plural query returns no results ("selfie sticks" → "selfie stick")', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ products: [], total: 0, skip: 0, limit: 30 }),
      )
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          products: productsFixture.slice(0, 1),
          total: 1,
          skip: 0,
          limit: 30,
        }),
      )

      const products = await fetchProducts({ q: 'selfie sticks' })

      expect(products).toHaveLength(1)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(decodedQ(fetchUrlAt(0))).toBe('selfie sticks')
      expect(decodedQ(fetchUrlAt(1))).toBe('selfie stick')
    })

    it('retries with the plural form when a singular query returns no results ("headphone" → "headphones")', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ products: [], total: 0, skip: 0, limit: 30 }),
      )
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          products: productsFixture.slice(0, 2),
          total: 2,
          skip: 0,
          limit: 30,
        }),
      )

      await fetchProducts({ q: 'headphone' })

      expect(decodedQ(fetchUrlAt(1))).toBe('headphones')
    })

    it('does not retry when the first call returned results', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          products: productsFixture.slice(0, 3),
          total: 3,
          skip: 0,
          limit: 30,
        }),
      )

      await fetchProducts({ q: 'iPhone' })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('returns empty when both primary and retry are empty', async () => {
      // A Response body can only be read once, so give each call a fresh one.
      fetchSpy.mockImplementation(async () =>
        jsonResponse({ products: [], total: 0, skip: 0, limit: 30 }),
      )

      const products = await fetchProducts({ q: 'kombucha' })

      expect(products).toHaveLength(0)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })
})
