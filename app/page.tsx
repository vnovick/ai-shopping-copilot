import { nanoid } from 'nanoid'
import { Chat } from '@/components/chat/chat'

// New-chat landing. Generates a fresh id per request; the chat is persisted
// to the DB on its first message, and the user navigates to it later via
// the sidebar. Refreshing `/` deliberately gives a fresh chat.
export default function Home() {
  const id = nanoid()
  return <Chat id={id} />
}
