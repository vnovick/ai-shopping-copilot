import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sampleProducts from '../../../tests/fixtures/products.json'
import { mapProduct, ProductSchema, tryMapProduct, type DummyProduct } from '../types'

describe('products/types', () => {
  it('parses a real DummyJSON product into the normalised shape', () => {
    const raw = sampleProducts[0] as DummyProduct
    const product = mapProduct(raw)

    expect(product.id).toBe(raw.id)
    expect(product.title).toBe(raw.title)
    expect(product.price).toBe(raw.price)
    expect(product.thumbnail).toBe(raw.thumbnail)
    expect(typeof product.discountPercentage).toBe('number')
    expect(Array.isArray(product.images)).toBe(true)
  })

  it('fills missing optional fields with safe defaults', () => {
    const product = ProductSchema.parse({ id: 99, title: 'Bare bones' })

    expect(product.brand).toBe('')
    expect(product.images).toEqual([])
    expect(product.rating).toBe(0)
    expect(product.availabilityStatus).toBe('')
  })

  it('rejects payloads with wrong field types', () => {
    expect(() => ProductSchema.parse({ id: 'not-a-number' })).toThrow()
  })
})

describe('tryMapProduct', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns the parsed product on success', () => {
    const raw = sampleProducts[0] as DummyProduct
    expect(tryMapProduct(raw)?.id).toBe(raw.id)
  })

  it('returns null on type-mismatch and logs the bad row instead of throwing', () => {
    const bad = { id: 'not-a-number', title: 'broken' } as unknown as DummyProduct

    expect(tryMapProduct(bad)).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      '[products] skipping malformed product',
      expect.objectContaining({ id: 'not-a-number' }),
    )
  })
})
