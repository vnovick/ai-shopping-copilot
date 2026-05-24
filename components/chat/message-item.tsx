import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'
import { ProductResults } from '@/components/products/product-results'
import type { AppliedFilters } from '@/lib/products/search'
import type { Product } from '@/lib/products/types'
import { cn } from '@/lib/utils'

type MessageItemProps = {
  message: UIMessage
}

// Shape of the `data-products` part written by the orchestrator when the
// intent is shopping. See lib/ai/orchestrator.ts.
type ProductsDataPart = {
  products: Product[]
  appliedFilters?: AppliedFilters
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      {message.parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <Bubble key={index} isUser={isUser}>
              {part.text}
            </Bubble>
          )
        }

        if (part.type === 'data-products') {
          const data = (part as { data?: ProductsDataPart }).data
          if (!data) return null
          return (
            <div key={index} className="w-full">
              <ProductResults products={data.products} filters={data.appliedFilters} />
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

function Bubble({ isUser, children }: { isUser: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
      )}
    >
      {children}
    </div>
  )
}
