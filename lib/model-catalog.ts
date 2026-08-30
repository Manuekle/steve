// Which service answers a prompt. Declared here rather than in
// lib/ai-provider.ts because that module reads the credential store (and so
// node:fs), which no client component can import.
export type AiProvider = "gateway" | "openai" | "anthropic" | "google";

export const AI_PROVIDERS: readonly AiProvider[] = ["gateway", "openai", "anthropic", "google"];

/**
 * The credential each provider authenticates with.
 *
 * Deliberately here, in the client-safe catalog, and not next to the code
 * that reads the store: the health check, the setup checklist and the credit
 * gate each used to inline the same ternary chain, so adding a provider meant
 * remembering three unrelated files — and forgetting one showed up as
 * "degraded" on a perfectly configured install.
 */
export const PROVIDER_CREDENTIAL_KEY = {
  gateway: "AI_GATEWAY_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
} as const satisfies Record<AiProvider, string>;

/** Model each provider uses when AI_MODEL is left empty. */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gateway: "openai/gpt-5-mini-fast",
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-5",
  google: "gemini-3.7-flash",
};

// Which model to use for what.
//
// The list of models is never hardcoded — it is fetched live from the
// provider (see lib/provider-catalog.ts), because model ids come and go and a
// baked-in list goes stale silently. What lives here is the *ranking*: for
// each task, an ordered list of ids we would pick first. The first one the
// provider actually offers wins, so a retired model degrades to the next
// choice instead of failing the request.

/** What the model is being asked to do. Cost and depth differ per task far
 *  more than they differ per user. */
export type ModelTask =
  /** Interactive conversation: the web chat and the messaging channels. */
  | "chat"
  /** Building or rewriting an automation flow — long, structured, and the
   *  output is a program someone will run. Worth the expensive model. */
  | "automation"
  /** Designing a custom agent's prompt and tool set. Same shape as above. */
  | "agent_design"
  /** Short mechanical calls: titles, classification, extraction. */
  | "quick";

export const MODEL_TASKS: readonly ModelTask[] = ["chat", "automation", "agent_design", "quick"];

export type CatalogModel = {
  /** Provider-native id for direct calls, `provider/model` through the Gateway. */
  readonly id: string;
  readonly label: string;
  /** Upstream vendor, e.g. "anthropic". For the Gateway this is the id prefix. */
  readonly vendor: string;
  /** USD per million input tokens, when the provider reports pricing. */
  readonly inputPerMillion?: number;
  readonly outputPerMillion?: number;
  readonly contextWindow?: number;
};

/**
 * Ordered preferences per provider and task, most preferred first.
 *
 * Reasoning behind the picks, using the Gateway's published prices
 * (USD per million tokens, input/output):
 *
 * - chat → `claude-sonnet-5` ($2/$10) and `gpt-5-mini` ($0.25/$2). Both are
 *   the value tier of their family: Sonnet 5 undercuts Sonnet 4.6 ($3/$15)
 *   while being newer, and gpt-5-mini is a third of `gpt-5-mini-fast`
 *   ($0.45/$3.60) for the same model, trading only latency.
 * - automation / agent_design → `claude-opus-5` ($5/$25) and
 *   `gpt-5.1-thinking` ($1.25/$10). These write a flow someone will run
 *   unattended, so a wrong step costs more than the tokens. Opus 5 is priced
 *   like Opus 4.5–4.8 but current; `gpt-5.1-thinking` is the reasoning line
 *   at the same price as plain `gpt-5`.
 * - quick → `claude-haiku-4.5` ($1/$5) and `gpt-5-nano` ($0.05/$0.40).
 *   Titles and classifications do not need a frontier model.
 *
 * Gateway entries carry the `vendor/model` form; the direct-provider entries
 * are the same models under each provider's own id spelling.
 */
const PREFERENCES: Record<AiProvider, Record<ModelTask, readonly string[]>> = {
  gateway: {
    chat: [
      "anthropic/claude-sonnet-5",
      "openai/gpt-5-mini",
      "google/gemini-3.7-flash",
      // The `-fast` variant is the same model on quicker hardware at roughly
      // 1.8x the price. It stays in the chain because a restricted or
      // throttled plan often still reaches it.
      "openai/gpt-5-mini-fast",
      "anthropic/claude-sonnet-4.6",
    ],
    automation: [
      "anthropic/claude-opus-5",
      "openai/gpt-5.1-thinking",
      "google/gemini-3.1-pro-preview",
      "anthropic/claude-opus-4.8",
      // Reachable tiers, for a plan that blocks the frontier models above.
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-mini-fast",
    ],
    agent_design: [
      "anthropic/claude-opus-5",
      "openai/gpt-5.1-thinking",
      "google/gemini-3.1-pro-preview",
      "anthropic/claude-opus-4.8",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-mini-fast",
    ],
    quick: [
      "anthropic/claude-haiku-4.5",
      "openai/gpt-5-nano",
      "google/gemini-3.1-flash-lite",
      "openai/gpt-5-mini",
      "openai/gpt-5-mini-fast",
    ],
  },
  openai: {
    chat: ["gpt-5-mini", "gpt-5.1-thinking", "gpt-5"],
    automation: ["gpt-5.1-thinking", "gpt-5", "gpt-5-mini"],
    agent_design: ["gpt-5.1-thinking", "gpt-5", "gpt-5-mini"],
    quick: ["gpt-5-nano", "gpt-5-mini"],
  },
  anthropic: {
    chat: ["claude-sonnet-5", "claude-sonnet-4-6", "claude-sonnet-4-5"],
    automation: ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5"],
    agent_design: ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5"],
    quick: ["claude-haiku-4-5", "claude-haiku-4-1", "claude-sonnet-5"],
  },
  // Gemini's own id spelling, no vendor prefix. Ids verified against
  // ai.google.dev/gemini-api/docs/pricing (2026-08-30) — the plain
  // `gemini-3-flash` and `gemini-3-pro` this list first guessed at do not
  // exist; the shipping names are `gemini-3.7-flash` and `gemini-3.1-pro-preview`.
  //
  // Flash is the value tier and the chat default ($0.75/$3.75); Pro is worth
  // it for a flow someone runs unattended ($2/$12); Flash-Lite handles titles
  // and classification ($0.25/$1.50). Each chain ends on a previous
  // generation so a retired id degrades instead of failing.
  google: {
    chat: ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-2.5-flash"],
    automation: ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3.7-flash"],
    agent_design: ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3.7-flash"],
    quick: ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.7-flash"],
  },
};

/** Last-resort ids, used when the catalog can't be fetched at all (offline,
 *  key not yet valid) so the app still has something to call. */
export const FALLBACK_MODEL: Record<AiProvider, string> = {
  gateway: "anthropic/claude-sonnet-5",
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-5",
  google: "gemini-3.7-flash",
};

/** Rough tier for the UI, derived from price rather than from the name — a
 *  name can lie about what a model costs, the price sheet cannot. */
export function modelTier(model: CatalogModel): "economy" | "balanced" | "premium" {
  const input = model.inputPerMillion;
  if (input === undefined) return "balanced";
  if (input <= 0.5) return "economy";
  if (input <= 3) return "balanced";
  return "premium";
}

/**
 * The model to use for a task: the first preference the provider actually
 * offers. Falls back to the cheapest available model, then to the static
 * fallback id, so this never returns nothing.
 */
export function pickForTask(
  provider: AiProvider,
  task: ModelTask,
  available: readonly CatalogModel[],
): string {
  const ids = new Set(available.map((model) => model.id));

  for (const candidate of PREFERENCES[provider][task]) {
    if (ids.has(candidate)) return candidate;
  }

  // Nothing ranked for this task is reachable — a restricted plan does this.
  // Borrow from the other tasks' rankings before considering anything
  // uncurated: a cheaper model we vouch for beats an unknown one.
  for (const other of MODEL_TASKS) {
    if (other === task) continue;
    for (const candidate of PREFERENCES[provider][other]) {
      if (ids.has(candidate)) return candidate;
    }
  }

  // The provider's own default, which is what the agent runs on anyway.
  if (ids.has(DEFAULT_MODELS[provider])) return DEFAULT_MODELS[provider];

  // Last resort. Deliberately not "cheapest in the catalog": the cheapest
  // entry across 200-plus models is some arbitrary vendor nobody chose, which
  // is a worse answer for a task than an id that at least fails loudly.
  return FALLBACK_MODEL[provider];
}

/** The ranked preferences themselves, for the UI's "recommended" markers. */
export function preferencesFor(provider: AiProvider, task: ModelTask): readonly string[] {
  return PREFERENCES[provider][task];
}

/** Every id this provider's rankings mention, for marking a model as one we
 *  vouch for anywhere in the app. */
export function recommendedIds(provider: AiProvider): ReadonlySet<string> {
  return new Set(MODEL_TASKS.flatMap((task) => [...PREFERENCES[provider][task]]));
}
