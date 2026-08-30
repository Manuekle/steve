import type { LanguageModel } from "ai";
import { defineAgent, defineDynamic } from "eve";
import { resolveLanguageModel, resolveProvider, resolveModelId } from "../lib/ai-provider";
import { applyStoredEnv } from "../lib/runtime-env";
import { claimChatModelSync } from "../lib/chat-model-store";
import { billingSourceForProvider, checkCreditGate } from "../lib/credit-gate";

// The model comes from Settings → Modelo de IA, which persists to
// ~/.steve/credentials.json. Three routes are supported:
//
//   gateway   — a bare model id string, routed by Eve through the Vercel AI
//               Gateway and authenticated with AI_GATEWAY_API_KEY.
//               See https://vercel.com/docs/ai-gateway and the Eve deployment
//               guide (node_modules/eve/docs/guides/deployment.md §3).
//   openai    — a direct @ai-sdk/openai LanguageModel with OPENAI_API_KEY.
//   anthropic — a direct @ai-sdk/anthropic LanguageModel with ANTHROPIC_API_KEY.
//
// Resolution happens at discovery time (synchronously, from the credential
// cache) and also mirrors the stored keys into process.env, since Eve and the
// AI SDK read process.env and know nothing about the credential store.
// Runs before the Postgres world is constructed, so a connection string saved
// in Settings takes effect on the next boot instead of needing a .env edit.
applyStoredEnv();

const fallbackModel = resolveLanguageModel();

if (process.env.NODE_ENV !== "production") {
  console.log(`[steve] model provider: ${resolveProvider()} · ${resolveModelId()}`);
}

/**
 * A model that fails every call with `reason`. Handed back from the
 * `step.started` resolver below when the AI-credits gate refuses an
 * included-credit call. Returning `null` or throwing from a dynamic model
 * resolver does *not* block the turn — per Eve's own docs, "failures
 * degrade, never fail the turn," and the scope just falls back to the next
 * one, which would silently let a blocked call through on `fallbackModel`.
 * A model that fails inside `doGenerate`/`doStream`, on the other hand, is a
 * genuine request-time failure ("a selected model without credentials fails
 * at request time" — same doc), which is the one mechanism that actually
 * stops the call. See lib/credit-gate.ts for why the gate exists and what it
 * checks.
 */
function creditsExhaustedModel(reason: string): LanguageModel {
  const fail = async (): Promise<never> => {
    throw new Error(reason);
  };
  return {
    specificationVersion: "v2",
    provider: "steve",
    modelId: "credits-exhausted",
    supportedUrls: {},
    doGenerate: fail,
    doStream: fail,
  } as unknown as LanguageModel;
}

// Per-conversation model choice, made in the chat's model picker.
//
// The picker cannot reach into Eve, so it writes to ~/.steve/chat-models.json
// and this resolver reads it back by session id (see lib/chat-model-store).
// Resolving on `step.started` is what lets a direct OpenAI/Anthropic pick
// work at all: session- and turn-scoped selections must serialize to a model
// id string, which only the Gateway route can express, while `step.started`
// may return a live AI SDK model. The id is stable within a conversation, so
// returning the same model each step keeps the prompt cache intact.
//
// Also where the AI-credits gate runs, once per model call — the same grain
// `step.completed` records usage at (agent/hooks/usage.ts). A BYOK or
// Enterprise call never touches the database here at all: `billingSourceForProvider`
// short-circuits to "BYOK" without a query, and `checkCreditGate` only reads
// the ledger for the one case that can actually be gated — an included-credit
// call on a hosted Pro/Managed installation.
const model = defineDynamic({
  fallback: fallbackModel,
  events: {
    "step.started": async (_event, ctx) => {
      const billingSource = await billingSourceForProvider(resolveProvider());
      const gate = await checkCreditGate(billingSource);
      if (!gate.allowed) return creditsExhaustedModel(gate.reason);

      const chosen = claimChatModelSync(ctx.session.id);
      return chosen ? resolveLanguageModel(chosen) : null;
    },
  },
});

export default defineAgent({
  model,

  // Bound accidental or adversarial sessions. Eve pauses interactive sessions
  // at these limits and asks the caller whether to continue.
  limits: {
    maxInputTokensPerSession: 200_000,
    maxOutputTokensPerSession: 20_000,
  },

  // Self-hosted durability: back session state, queues, hooks, and streams
  // with the Postgres Workflow world instead of Vercel Workflow.
  // Credentials/options come from WORKFLOW_POSTGRES_URL at runtime.
  experimental: {
    workflow: {
      world: "@workflow/world-postgres",
    },
  },

  // Keep the world package external so graphile-worker and pg remain normal
  // runtime dependencies in the compiled host.
  build: {
    externalDependencies: ["@workflow/world-postgres"],
  },
});
