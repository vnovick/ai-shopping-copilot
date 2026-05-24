import { getChats } from '@/lib/db/queries'

export const runtime = 'nodejs'

export async function GET() {
  const chats = await getChats()
  return Response.json(chats)
}
