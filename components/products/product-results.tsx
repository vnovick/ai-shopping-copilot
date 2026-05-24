import type { Product } from '@/lib/products/types'
import type { AppliedFilters } from '@/lib/products/search'
import { ProductCard } from './product-card'

type ProductResultsProps = {
  products: Product[]
  filters?: AppliedFilters
}

export function ProductResults({ products, filters }: ProductResultsProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        No matches for that query. Try a wider price range or a different category.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {filters && <FilterBadges filters={filters} />}
      <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

function FilterBadges({ filters }: { filters: AppliedFilters }) {
  const badges: string[] = []
  if (filters.category) badges.push(filters.category)
  if (filters.query) badges.push(`"${filters.query}"`)
  if (filters.priceMax != null) badges.push(`≤ $${filters.priceMax}`)
  if (filters.priceMin != null) badges.push(`≥ $${filters.priceMin}`)
  if (filters.minRating != null) badges.push(`★ ${filters.minRating}+`)
  if (filters.sortBy && filters.sortBy !== 'relevance') badges.push(filters.sortBy)

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {badges.map((b) => (
        <span
          key={b}
          className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
        >
          {b}
        </span>
      ))}
    </div>
  )
}
