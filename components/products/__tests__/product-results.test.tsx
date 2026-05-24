import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Product } from '@/lib/products/types'
import { ProductResults } from '../product-results'

vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => (
    <img src={props.src} alt={props.alt} />
  ),
}))

function makeProduct(id: number): Product {
  return {
    id,
    title: `Product ${id}`,
    description: '',
    category: 'misc',
    price: id * 10,
    discountPercentage: 0,
    rating: 4,
    brand: '',
    stock: 5,
    thumbnail: `https://cdn.dummyjson.com/${id}.png`,
    images: [],
    availabilityStatus: '',
  }
}

describe('ProductResults', () => {
  it('renders one card per product', () => {
    render(<ProductResults products={[makeProduct(1), makeProduct(2), makeProduct(3)]} />)
    expect(screen.getByText('Product 1')).toBeInTheDocument()
    expect(screen.getByText('Product 2')).toBeInTheDocument()
    expect(screen.getByText('Product 3')).toBeInTheDocument()
  })

  it('renders the no-matches placeholder when empty', () => {
    render(<ProductResults products={[]} />)
    expect(screen.getByText(/no matches/i)).toBeInTheDocument()
  })

  it('shows applied-filter badges', () => {
    render(
      <ProductResults
        products={[makeProduct(1)]}
        filters={{
          category: 'beauty',
          priceMax: 50,
          minRating: 4,
          sortBy: 'rating-desc',
          limit: 6,
        }}
      />,
    )
    expect(screen.getByText('beauty')).toBeInTheDocument()
    expect(screen.getByText('≤ $50')).toBeInTheDocument()
    expect(screen.getByText('★ 4+')).toBeInTheDocument()
    expect(screen.getByText('rating-desc')).toBeInTheDocument()
  })
})
