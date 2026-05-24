import { tool } from 'ai'
import { z } from 'zod'
import { fetchCategories } from '@/lib/products/client'

// Only model-facing tool. Read-only — the orchestrator owns retrieval.
// The model can call this on the reply step to ground prose in real
// slugs ("we don't carry X, but we do have Y, Z…").

export const listCategoriesInputSchema = z.object({})

export const listCategoriesTool = tool({
  description:
    "List every category slug in the catalogue. Use when you want to mention what kinds of products exist (e.g. the user asked 'what do you have?', or you're suggesting an alternative when the current search came back empty). Read-only — it doesn't run a search.",
  inputSchema: listCategoriesInputSchema,
  // Operational errors become typed empty results so the reply prompt
  // can apologise around an empty list instead of the stream dying.
  execute: async () => {
    try {
      return { categories: await fetchCategories() }
    } catch (err) {
      console.error('[listCategoriesTool] fetchCategories failed', {
        err: err instanceof Error ? { name: err.name, message: err.message } : err,
      })
      return { categories: [] as string[] }
    }
  },
})
