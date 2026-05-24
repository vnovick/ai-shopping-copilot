import { describe, expect, it } from 'vitest'
import { listCategoriesInputSchema } from '../tools'

describe('listCategoriesTool input schema', () => {
  it('accepts an empty object (the tool takes no parameters)', () => {
    expect(() => listCategoriesInputSchema.parse({})).not.toThrow()
  })
})
