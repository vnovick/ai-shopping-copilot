import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  getChats: vi.fn(),
}))

import { getChats } from '@/lib/db/queries'
import { GET } from '../route'

describe('GET /api/chats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the chat list as JSON', async () => {
    vi.mocked(getChats).mockResolvedValue([
      {
        id: 'c1',
        title: 'First chat',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ])

    const res = await GET()

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe('c1')
    expect(data[0].title).toBe('First chat')
  })

  it('returns an empty array when there are no chats', async () => {
    vi.mocked(getChats).mockResolvedValue([])
    const res = await GET()
    expect(await res.json()).toEqual([])
  })
})
