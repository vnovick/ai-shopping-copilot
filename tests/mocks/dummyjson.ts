import { http, HttpResponse } from 'msw'
import products from '../fixtures/products.json'

// MSW handlers that intercept DummyJSON calls in tests so we don't hit
// the real API. Behaviour mirrors DummyJSON's query semantics closely
// enough for our client/search code to exercise the same paths.
export const handlers = [
  http.get('https://dummyjson.com/products', () =>
    HttpResponse.json({
      products,
      total: products.length,
      skip: 0,
      limit: products.length,
    }),
  ),

  http.get('https://dummyjson.com/products/search', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase() ?? ''
    const filtered = q
      ? products.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            (p.category ?? '').toLowerCase().includes(q),
        )
      : products
    return HttpResponse.json({
      products: filtered,
      total: filtered.length,
      skip: 0,
      limit: filtered.length,
    })
  }),

  http.get('https://dummyjson.com/products/category/:slug', ({ params }) => {
    const filtered = products.filter((p) => p.category === params.slug)
    return HttpResponse.json({
      products: filtered,
      total: filtered.length,
      skip: 0,
      limit: filtered.length,
    })
  }),

  http.get('https://dummyjson.com/products/category-list', () => {
    const unique = Array.from(new Set(products.map((p) => p.category)))
    return HttpResponse.json(unique)
  }),

  // Kept for completeness in case anything still hits the heavier endpoint.
  http.get('https://dummyjson.com/products/categories', () => {
    const unique = Array.from(new Set(products.map((p) => p.category)))
    return HttpResponse.json(
      unique.map((slug) => ({
        slug,
        name: slug,
        url: `https://dummyjson.com/products/category/${slug}`,
      })),
    )
  }),
]
