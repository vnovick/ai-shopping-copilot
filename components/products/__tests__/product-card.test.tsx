import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Product } from '@/lib/products/types'
import { ProductCard } from '../product-card'

// next/image needs the App Router context to fully boot; for unit tests just
// render a plain <img>.
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string; className?: string }) => (
    <img src={props.src} alt={props.alt} className={props.className} />
  ),
}))

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Wireless Headphones',
    description: 'Crisp and comfy',
    category: 'audio',
    price: 99.99,
    discountPercentage: 0,
    rating: 4.5,
    brand: 'Acme',
    stock: 10,
    thumbnail: 'https://cdn.dummyjson.com/test.png',
    images: [],
    availabilityStatus: '',
    ...overrides,
  }
}

describe('ProductCard', () => {
  it('renders title, price, rating, and brand', () => {
    render(<ProductCard product={makeProduct()} />)
    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument()
    expect(screen.getByText('$99.99')).toBeInTheDocument()
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('shows discounted final price with original price struck-through', () => {
    render(<ProductCard product={makeProduct({ price: 100, discountPercentage: 20 })} />)
    expect(screen.getByText('$80.00')).toBeInTheDocument()
    const original = screen.getByText('$100.00')
    expect(original.className).toContain('line-through')
  })

  it('omits brand row when brand is empty', () => {
    render(<ProductCard product={makeProduct({ brand: '' })} />)
    expect(screen.queryByText('Acme')).not.toBeInTheDocument()
  })
})
