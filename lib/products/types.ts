import { z } from 'zod'
import type { components } from './openapi-types'

// Raw API shape, exactly as DummyJSON serves it (generated from the spec).
export type DummyProduct = components['schemas']['Product']

// Runtime-validated, normalised product shape used by the UI + AI tool.
// Zod is the single source of truth for both the TS type (via `z.infer`)
// and runtime parsing. `.default(...)` fills any optional field DummyJSON
// omits, so downstream consumers never need null-checks.
export const ProductSchema = z.object({
  id: z.number().default(0),
  title: z.string().default(''),
  description: z.string().default(''),
  category: z.string().default(''),
  price: z.number().default(0),
  discountPercentage: z.number().default(0),
  rating: z.number().default(0),
  brand: z.string().default(''),
  stock: z.number().default(0),
  thumbnail: z.string().default(''),
  images: z.array(z.string()).default([]),
  availabilityStatus: z.string().default(''),
})

export type Product = z.infer<typeof ProductSchema>

export function mapProduct(raw: DummyProduct): Product {
  return ProductSchema.parse(raw)
}

// Resilient mapper for the fetch path: one malformed product no longer
// kills the whole stream. The schema defaults absorb most "missing
// field" shapes; this catches type mismatches on required-by-contract
// fields (e.g. `price: "free"`).
export function tryMapProduct(raw: DummyProduct): Product | null {
  const result = ProductSchema.safeParse(raw)
  if (!result.success) {
    console.warn('[products] skipping malformed product', {
      id: (raw as { id?: unknown }).id,
      issues: result.error.issues,
    })
    return null
  }
  return result.data
}
