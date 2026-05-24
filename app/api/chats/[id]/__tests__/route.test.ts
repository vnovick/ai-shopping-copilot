import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({
  deleteChat: vi.fn(),
  getChat: vi.fn(),
}))

import { deleteChat, getChat } from '@/lib/db/queries'
import { DELETE } from '../route'

describe('DELETE /api/chats/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 204 when the chat exists and gets deleted', async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: 'c1',
      title: 'Existing chat',
      createdAt: new Date('2024-01-01'),
    })
    vi.mocked(deleteChat).mockResolvedValue(undefined)

    const req = new Request('http://localhost/api/chats/c1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'c1' }) })

    expect(res.status).toBe(204)
    expect(deleteChat).toHaveBeenCalledWith('c1')
  })

  it('returns 404 without calling deleteChat when the chat is missing', async () => {
    vi.mocked(getChat).mockResolvedValue(null)

    const req = new Request('http://localhost/api/chats/nope', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'nope' }) })

    expect(res.status).toBe(404)
    expect(deleteChat).not.toHaveBeenCalled()
  })
})
