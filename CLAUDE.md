
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Tooling

**Always use `pnpm`** — never `npm`, `npx`, or `yarn`. Lockfile is `pnpm-lock.yaml`; a `pnpm-workspace.yaml` is present. Mixing managers drifts the resolved vs. on-disk dep graph.

| npm                 | pnpm                                                |
| ------------------- | --------------------------------------------------- |
| `npm install`       | `pnpm install`                                      |
| `npm install <pkg>` | `pnpm add <pkg>` (`-D` for dev)                     |
| `npx <bin>`         | `pnpm dlx <bin>` (one-off) or `pnpm exec <bin>`     |
| `npm run <script>`  | `pnpm <script>` or `pnpm run <script>`              |

If pnpm v10 has blocked a postinstall (look for "Ignored build scripts" in install output), run `pnpm rebuild <pkg>` from the project root.

## Commands

- `pnpm test` — vitest unit + component + integration. Fast (~1s), no LLM, no network. Run before declaring anything done.
- `pnpm test:e2e` — Playwright. Spins up `next start` on port 3100 with its own SQLite (`local-e2e.db`); don't rely on `pnpm dev` being up.
- `pnpm eval` — real-model eval suite. Requires `OPENAI_API_KEY` in `.env.local`. ~$0.05 per run. **Gated out of `pnpm test`** for cost + determinism; run manually when prompts or intent schema change.
- `pnpm gen:openapi` — regenerate `lib/products/openapi-types.ts` from `dummyjson_products_openapi.yaml`. The spec is annotated for params DummyJSON supports in practice but doesn't document upstream (e.g. `sortBy`/`order` on `/search` + `/category`).

## Architectural rules (preserve these)

- **Hallucination guard is structural.** Product cards on screen come from the `data-products` UI message part emitted in `lib/ai/orchestrator.ts`. The shopping-branch system prompt forbids product titles/prices/IDs in prose; the eval suite (`textMentionsAnyProductTitle`) asserts it. Don't make products available to the model as text-generated output.
- **Deterministic retrieval.** `extractIntent` → `searchAndRank` runs as code, not as a tool call. The model never decides *whether* to search. Don't add a `searchProducts` tool, and don't route retrieval through `streamText` tools.
- **Intent classifier is intentionally blind to the live catalogue.** Don't inject the slug list into `INTENT_PROMPT`. Classifier output is allowed to be wrong about which slugs exist — see the anti-corruption layer below.
- **Anti-corruption layer at the LLM/data boundary.** `lib/products/normalize-input.ts` reconciles classifier output with catalogue reality (drop invented slugs, promote slug-shaped queries, treat `0` as "no constraint"). One cached `fetchCategories` call at the entry point; helpers are pure-sync. Don't push catalogue knowledge upstream into the prompt or downstream into `search.ts`.
- **`listCategories` is the only model-facing tool.** Read-only, available on the reply step only. New tools need a strong justification — the agentic surface is intentionally small.
- **Sidebar is the sole chat-navigation surface.** Never auto-`router.replace` after the first message; the sidebar updates via SWR `mutate('/api/chats')`.

## Operational invariants

- **Atomic first-turn persistence.** Use `persistFirstTurnAtomic` from `lib/db/queries.ts` — it's the only correct way to write the chat + first user message. It wraps both inserts in one SQLite transaction with `.onConflictDoNothing()` so concurrent POSTs converge instead of 500-ing.
- **`AbortSignal` flows from the route to `streamText`.** Don't drop it on the floor in any new branch. The plumbing goes `request.signal` → `streamCopilot({ signal })` → `runReplyStream({ signal })` → `streamText({ abortSignal: signal })`.
- **Structured error classification on the route boundary.** Map provider error shapes to HTTP semantics in `classifyError` (`app/api/chat/route.ts`). Log with `{chatId, lastUserMessageId, classifiedStatus}`. Don't let raw provider errors leak to the client.
- **Defensive coercion at upstream boundaries.** `tryMapProduct` for product rows, `fetchCategories().catch(() => [])` for catalogue lookups — one bad upstream row/response never kills the stream. Mirror this pattern on any new external call.
- **Request validation lives at the route.** Body size cap + Zod parse before touching `streamCopilot`. Don't move validation into the orchestrator.

## Test layers

- **Unit / component / integration** all in `pnpm test`. Add tests next to the code (`__tests__/` siblings).
- **Branch tests for `streamCopilot`** mock `extractIntent` + `searchAndRank` + `streamText` (see `lib/ai/__tests__/orchestrator.test.ts`). When you add a branch, add a test for the system prompt, the tool surface, the `data-products` emission, and the `abortSignal` forwarding.
- **Eval text assertions** (`lib/evals/assertions.ts`) pin the prompt-rule surface. When you tighten a prompt, add or update the matching `text*` assertion. When you add a branch, add cases that exercise its system-prompt rules.

## When extending

- Adding a new `streamText` invocation? Route it through `runReplyStream` in `lib/ai/orchestrator.ts` — same `stopWhen`, same tool surface, same `abortSignal` forwarding.
- Adding a new product filter? Touch the chain (`SearchInput` → `NormalizedSearchInput` → `Intent` → `formatProductsContext`) end-to-end, plus the eval cases. Boundary mismatches are silent.