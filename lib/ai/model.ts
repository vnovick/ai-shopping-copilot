// Single source of truth for the OpenAI model id used by the classifier
// and the reply step. Both call sites (`lib/ai/intent.ts`,
// `lib/ai/orchestrator.ts`) read this — change it here to swap models.
//
// The current value is a post-cutoff GPT-5 mini variant; tools that
// pre-date it may not recognise the id. See the Tradeoffs table in
// README.md for the rationale.
export const OPENAI_MODEL_ID = 'gpt-5.4-mini'
