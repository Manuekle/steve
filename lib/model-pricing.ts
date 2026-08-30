import { creditsQuery } from "./credits-db";

// Centralized model pricing — the one place a $/token or $/character number
// is allowed to live. Nothing in components or route handlers hardcodes a
// price; everyone calls computeProviderCost() or getModelPricing() here.
//
// Two lookup paths, in order:
//
//   1. credits.model_pricing in Postgres — an operator can insert/update rows
//      there (there is no admin UI for it yet; it's a real table so one can
//      be added later without a schema change) to correct or extend prices
//      without a deploy.
//   2. SEED below — the real, published prices this repo ships with, so
//      pricing works out of the box on a fresh install with an empty table.
//
// Not needed for Gateway-routed LLM calls at all: when a model is called
// through the Vercel AI Gateway, Eve's own `step.completed` stream event
// already carries `usage.costUsd` (the Gateway publishes list price with zero
// markup — see docs cited below), and lib/ai-usage.ts uses that directly
// instead of consulting this module. This module exists for the two paths
// that don't get a cost handed to them: direct-provider mode (OpenAI/Anthropic
// called without the Gateway) and ElevenLabs (which never goes through Eve's
// model loop at all).

export type Modality = "llm" | "tts";

export type ModelPricing = {
  readonly provider: string;
  readonly model: string;
  readonly modality: Modality;
  readonly inputCostPer1M?: number;
  readonly outputCostPer1M?: number;
  readonly cachedInputCostPer1M?: number;
  readonly characterCostPer1K?: number;
  readonly currency: string;
  readonly sourceNote?: string;
};

/**
 * Real, published prices as of 2026-08-30. USD per million tokens unless
 * noted. Anthropic figures are official (platform.claude.com/docs, which
 * includes the prompt-caching multiplier table this file's cache prices are
 * derived from: 5m cache write = 1.25x input, 1h write = 2x input, cache read
 * = 0.1x input). OpenAI figures could not be confirmed against
 * openai.com/api/pricing directly (it blocks automated fetches) — they are
 * cross-referenced against third-party trackers and match the estimate that
 * already lived as a comment in lib/model-catalog.ts before this file
 * existed; treat them as medium confidence and reverify before relying on
 * them for a real invoice. `gpt-5.1-thinking` and `gpt-5-mini-fast` have no
 * independently published rate at all — both are explicit guesses, flagged
 * below, and should be the first two rows an operator overrides in
 * credits.model_pricing once real numbers are confirmed.
 *
 * ElevenLabs is not pay-as-you-go metered like the other two — it is a
 * credit-subscription product. The rate below is back-computed from the
 * Business tier (elevenlabs.io/pricing: $990/mo for 6,000,000 credits, and
 * 1 character = 1 credit on eleven_multilingual_v2) purely as a display
 * estimate; an account on a different tier pays a different effective rate.
 * This is exactly the "Estimated provider usage" case the AI Usage dashboard
 * has to label as such rather than presenting as a bill.
 *
 * Google/Gemini rows are OFFICIAL, confirmed against ai.google.dev/pricing on
 * 2026-08-30. Standard tier prices used; multi-tier models (Pro ≤200k vs >200k)
 * use the ≤200k tier. All prices listed are the current rates (through
 * 2026-12-31) — the 2027 Jan 1 rate increase is not modeled yet.
 *
 * The Vercel AI Gateway itself charges no markup on any of the above
 * (vercel.com/docs/ai-gateway/pricing) — routing a model through it doesn't
 * change its row here.
 */
const SEED: readonly ModelPricing[] = [
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    modality: "llm",
    inputCostPer1M: 2,
    outputCostPer1M: 10,
    cachedInputCostPer1M: 0.2,
    currency: "usd",
    sourceNote: "platform.claude.com/docs — official, 2026-08-30",
  },
  {
    provider: "anthropic",
    model: "claude-opus-5",
    modality: "llm",
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    cachedInputCostPer1M: 0.5,
    currency: "usd",
    sourceNote: "platform.claude.com/docs — official, 2026-08-30",
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    modality: "llm",
    inputCostPer1M: 1,
    outputCostPer1M: 5,
    cachedInputCostPer1M: 0.1,
    currency: "usd",
    sourceNote: "platform.claude.com/docs — official, 2026-08-30",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    modality: "llm",
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    cachedInputCostPer1M: 0.3,
    currency: "usd",
    sourceNote: "platform.claude.com/docs — official, 2026-08-30",
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-8",
    modality: "llm",
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    cachedInputCostPer1M: 0.5,
    currency: "usd",
    sourceNote: "platform.claude.com/docs — official, 2026-08-30",
  },
  {
    provider: "openai",
    model: "gpt-5",
    modality: "llm",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
    currency: "usd",
    sourceNote: "cross-referenced, 2026-08-30 — medium confidence, openai.com blocked direct fetch",
  },
  {
    provider: "openai",
    model: "gpt-5-mini",
    modality: "llm",
    inputCostPer1M: 0.25,
    outputCostPer1M: 2,
    currency: "usd",
    sourceNote: "cross-referenced, 2026-08-30 — medium confidence",
  },
  {
    provider: "openai",
    model: "gpt-5-nano",
    modality: "llm",
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.4,
    currency: "usd",
    sourceNote: "cross-referenced, 2026-08-30 — medium confidence",
  },
  {
    provider: "openai",
    model: "gpt-5.1-thinking",
    modality: "llm",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
    cachedInputCostPer1M: 0.125,
    currency: "usd",
    sourceNote: "GUESS: no published rate for the -thinking variant found, assumed equal to gpt-5.1 base — low confidence, verify",
  },
  {
    provider: "openai",
    model: "gpt-5-mini-fast",
    modality: "llm",
    inputCostPer1M: 0.45,
    outputCostPer1M: 3.6,
    currency: "usd",
    sourceNote: "GUESS: ~1.8x gpt-5-mini per this repo's own lib/model-catalog.ts comment — not independently verified, low confidence",
  },
  {
    provider: "google",
    model: "gemini-3.7-flash",
    modality: "llm",
    inputCostPer1M: 0.75,
    outputCostPer1M: 3.75,
    cachedInputCostPer1M: 0.075,
    currency: "usd",
    sourceNote: "ai.google.dev/pricing — official, 2026-08-30 (standard tier, through Dec 2026)",
  },
  {
    provider: "google",
    model: "gemini-3.6-flash",
    modality: "llm",
    inputCostPer1M: 0.75,
    outputCostPer1M: 3.75,
    cachedInputCostPer1M: 0.075,
    currency: "usd",
    sourceNote: "ai.google.dev/pricing — official, 2026-08-30 (standard tier, through Dec 2026)",
  },
  {
    provider: "google",
    model: "gemini-3.1-pro-preview",
    modality: "llm",
    inputCostPer1M: 2.0,
    outputCostPer1M: 12.0,
    cachedInputCostPer1M: 0.2,
    currency: "usd",
    sourceNote: "ai.google.dev/pricing — official, 2026-08-30 (standard tier, ≤200k tokens; >200k is $4/$18/$0.40)",
  },
  {
    provider: "google",
    model: "gemini-3.1-flash-lite",
    modality: "llm",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.5,
    cachedInputCostPer1M: 0.025,
    currency: "usd",
    sourceNote: "ai.google.dev/pricing — official, 2026-08-30 (standard tier, text/image/video)",
  },
  {
    provider: "google",
    model: "gemini-2.5-flash",
    modality: "llm",
    inputCostPer1M: 0.3,
    outputCostPer1M: 2.5,
    cachedInputCostPer1M: 0.03,
    currency: "usd",
    sourceNote: "ai.google.dev/pricing — official, 2026-08-30 (standard tier, text/image/video; audio is $1.00 input)",
  },
  {
    provider: "google",
    model: "gemini-2.5-flash-lite",
    modality: "llm",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    cachedInputCostPer1M: 0.01,
    currency: "usd",
    sourceNote: "ai.google.dev/pricing — official, 2026-08-30 (standard tier, text/image/video; audio is $0.30 input)",
  },
  {
    provider: "google",
    model: "gemini-2.5-pro",
    modality: "llm",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    cachedInputCostPer1M: 0.125,
    currency: "usd",
    sourceNote: "ai.google.dev/pricing — official, 2026-08-30 (standard tier, ≤200k tokens; >200k is $2.50/$15/$0.25)",
  },
  {
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    modality: "tts",
    characterCostPer1K: 0.165,
    currency: "usd",
    sourceNote: "ESTIMATE from Business tier ($990 / 6,000,000 credits, 1 credit = 1 char) — elevenlabs.io/pricing, 2026-08-30, varies by actual account plan",
  },
];

type PricingRow = {
  readonly provider: string;
  readonly model: string;
  readonly modality: Modality;
  readonly input_cost_per_1m: string | null;
  readonly output_cost_per_1m: string | null;
  readonly cached_input_cost_per_1m: string | null;
  readonly character_cost_per_1k: string | null;
  readonly currency: string;
  readonly source_note: string | null;
};

function num(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The active price for a model, DB first, seed fallback. `undefined` when
 *  neither has it — callers must not guess a price in that case. */
export async function getModelPricing(provider: string, model: string): Promise<ModelPricing | undefined> {
  try {
    const rows = await creditsQuery<PricingRow>(
      `SELECT provider, model, modality, input_cost_per_1m, output_cost_per_1m,
              cached_input_cost_per_1m, character_cost_per_1k, currency, source_note
         FROM credits.model_pricing
        WHERE provider = $1 AND model = $2 AND active = true
          AND effective_from <= now()
          AND (effective_until IS NULL OR effective_until > now())
        ORDER BY effective_from DESC
        LIMIT 1`,
      [provider, model],
    );
    const row = rows[0];
    if (row) {
      return {
        provider: row.provider,
        model: row.model,
        modality: row.modality,
        inputCostPer1M: num(row.input_cost_per_1m),
        outputCostPer1M: num(row.output_cost_per_1m),
        cachedInputCostPer1M: num(row.cached_input_cost_per_1m),
        characterCostPer1K: num(row.character_cost_per_1k),
        currency: row.currency,
        sourceNote: row.source_note ?? undefined,
      };
    }
  } catch {
    // Postgres unreachable — fall through to the seed rather than failing
    // the caller. A stale built-in price beats no price and no usage record.
  }
  return SEED.find((entry) => entry.provider === provider && entry.model === model);
}

export type UsageAmounts = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly characters?: number;
};

export type ProviderCostBreakdown = {
  /** Billable + cached input cost combined — the schema keeps one
   *  `input_cost` column, not a separate one for cache reads. */
  readonly inputCost: number | null;
  readonly outputCost: number | null;
  readonly cost: number;
  readonly pricing: ModelPricing;
};

/** Provider cost in USD for one call, from ModelPricing + raw usage. Returns
 *  `undefined` when pricing isn't known for this provider/model — the caller
 *  (lib/ai-usage.ts) still records the usage, just without a cost figure,
 *  rather than inventing one. */
export async function computeProviderCost(
  provider: string,
  model: string,
  usage: UsageAmounts,
): Promise<ProviderCostBreakdown | undefined> {
  const pricing = await getModelPricing(provider, model);
  if (!pricing) return undefined;

  if (pricing.modality === "tts") {
    if (usage.characters === undefined || pricing.characterCostPer1K === undefined) return undefined;
    const cost = (usage.characters / 1000) * pricing.characterCostPer1K;
    // No input/output split for a character-billed model — the whole cost is
    // neither "input" nor "output" in the LLM sense.
    return { inputCost: null, outputCost: null, cost, pricing };
  }

  if (pricing.inputCostPer1M === undefined && pricing.outputCostPer1M === undefined) return undefined;

  const billableInput = Math.max(0, (usage.inputTokens ?? 0) - (usage.cachedInputTokens ?? 0));
  const baseInputCost =
    pricing.inputCostPer1M !== undefined ? (billableInput / 1_000_000) * pricing.inputCostPer1M : 0;
  const cachedCost =
    usage.cachedInputTokens && pricing.cachedInputCostPer1M !== undefined
      ? (usage.cachedInputTokens / 1_000_000) * pricing.cachedInputCostPer1M
      : 0;
  const outputCost =
    pricing.outputCostPer1M !== undefined ? ((usage.outputTokens ?? 0) / 1_000_000) * pricing.outputCostPer1M : 0;
  const inputCost = baseInputCost + cachedCost;

  return { inputCost, outputCost, cost: inputCost + outputCost, pricing };
}
