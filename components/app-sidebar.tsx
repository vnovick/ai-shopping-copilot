'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import useSWR, { useSWRConfig } from 'swr'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

type ChatRow = {
  id: string
  title: string
  createdAt: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data: chats = [], isLoading } = useSWR<ChatRow[]>('/api/chats', fetcher)
  // One dialog at a time — track the chat row being confirmed for delete.
  const [pendingDelete, setPendingDelete] = useState<ChatRow | null>(null)

  const activeId = pathname.startsWith('/chat/') ? pathname.slice('/chat/'.length) : null

  async function confirmDelete() {
    if (!pendingDelete) return
    const { id, title } = pendingDelete
    setPendingDelete(null)

    const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(`Couldn't delete "${title}"`)
      return
    }
    await mutate('/api/chats')
    if (activeId === id) router.replace('/')
    toast.success(`Deleted "${title}"`)
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="px-4 py-3">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-sidebar-foreground"
          >
            AI Shopping
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="px-3 pt-2">
            <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
              <Link href="/">
                <PlusIcon />
                New chat
              </Link>
            </Button>
          </SidebarGroup>

          <SidebarGroup className="px-3">
            {isLoading ? (
              <p className="px-2 py-4 text-xs text-sidebar-foreground/60">Loading…</p>
            ) : chats.length === 0 ? (
              <p className="px-2 py-4 text-xs text-sidebar-foreground/60">
                No conversations yet.
              </p>
            ) : (
              <SidebarMenu>
                {chats.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton asChild isActive={chat.id === activeId}>
                      <Link href={`/chat/${chat.id}`}>
                        <span className="truncate">{chat.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    <button
                      type="button"
                      aria-label={`Delete ${chat.title}`}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setPendingDelete(chat)
                      }}
                      className={cn(
                        'absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1',
                        'text-sidebar-foreground/40 opacity-0 transition group-hover/menu-item:opacity-100',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <TrashIcon />
                    </button>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-3 py-2">
          <div className="flex items-center justify-end">
            <ThemeToggle />
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; and all of its messages will be removed.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}
