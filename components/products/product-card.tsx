import Image from 'next/image'
import type { Product } from '@/lib/products/types'

export function ProductCard({ product }: { product: Product }) {
  const discounted = product.discountPercentage > 0
  const finalPrice = discounted
    ? product.price * (1 - product.discountPercentage / 100)
    : product.price

  return (
    <article className="flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
        {product.thumbnail && (
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            sizes="224px"
            className="object-cover"
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 text-sm leading-snug font-medium">{product.title}</h3>
        <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p>

        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-sm font-semibold">${finalPrice.toFixed(2)}</span>
          {discounted && (
            <span className="text-xs text-muted-foreground line-through">
              ${product.price.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <StarIcon />
          <span>{product.rating.toFixed(1)}</span>
          {product.brand && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{product.brand}</span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  )
}
