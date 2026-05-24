import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UIMessage } from 'ai'
import { MessageItem } from '../message-item'

vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => (
    <img src={props.src} alt={props.alt} />
  ),
}))

describe('MessageItem', () => {
  it('renders plain text parts', () => {
    const msg = {
      id: '1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hello world' }],
    } as unknown as UIMessage

    render(<MessageItem message={msg} />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders ProductResults from a data-products part', () => {
    const msg = {
      id: '2',
      role: 'assistant',
      parts: [
        {
          type: 'data-products',
          data: {
            products: [
              {
                id: 1,
                title: 'Headphones',
                description: '',
                category: 'audio',
                price: 99,
                discountPercentage: 0,
                rating: 4.5,
                brand: 'Acme',
                stock: 5,
                thumbnail: 'https://cdn.dummyjson.com/1.png',
                images: [],
                availabilityStatus: '',
              },
            ],
            appliedFilters: { sortBy: 'relevance', limit: 6 },
          },
        },
      ],
    } as unknown as UIMessage

    render(<MessageItem message={msg} />)
    expect(screen.getByText('Headphones')).toBeInTheDocument()
  })

  it('renders both a data-products part and a following text part', () => {
    const msg = {
      id: '3',
      role: 'assistant',
      parts: [
        {
          type: 'data-products',
          data: {
            products: [
              {
                id: 7,
                title: 'Lipstick',
                description: '',
                category: 'beauty',
                price: 12,
                discountPercentage: 0,
                rating: 4.2,
                brand: '',
                stock: 5,
                thumbnail: '',
                images: [],
                availabilityStatus: '',
              },
            ],
            appliedFilters: { sortBy: 'relevance', limit: 6 },
          },
        },
        { type: 'text', text: 'Here are a few beauty picks.' },
      ],
    } as unknown as UIMessage

    render(<MessageItem message={msg} />)
    expect(screen.getByText('Lipstick')).toBeInTheDocument()
    expect(screen.getByText('Here are a few beauty picks.')).toBeInTheDocument()
  })

  it('skips parts of unknown types', () => {
    const msg = {
      id: '4',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'internal scratch' },
        { type: 'text', text: 'the visible reply' },
      ],
    } as unknown as UIMessage

    render(<MessageItem message={msg} />)
    expect(screen.getByText('the visible reply')).toBeInTheDocument()
    expect(screen.queryByText('internal scratch')).not.toBeInTheDocument()
  })
})
