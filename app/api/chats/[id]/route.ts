import { deleteChat, getChat } from '@/lib/db/queries'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

// Chat reads go through the server component at `app/chat/[id]/page.tsx`
// (direct DB query, no HTTP round-trip). Only DELETE is exposed here.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params
  const existing = await getChat(id)
  if (!existing) return new Response('not found', { status: 404 })
  await deleteChat(id)
  return new Response(null, { status: 204 })
}
