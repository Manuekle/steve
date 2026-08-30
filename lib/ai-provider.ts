import type { EmbeddingModel, LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { getCredentialSync } from "./credentials";
import { applyModelEnv } from "./runtime-env";
import { AI_PROVIDERS, DEFAULT_MODELS, type AiProvider } from "./model-catalog";

// Re-exported so server modules keep a single import for "the provider and
// how to call it"; the definitions themselves live in the client-safe
// catalog module.
export { AI_PROVIDERS, DEFAULT_MODELS };
export type { AiProvider };

// Which service actually answers the agent's prompts.
//
// "gateway" routes through the Vercel AI Gateway (one key, whole catalog);
// "openai" and "anthropic" call the provider directly with that provider's
// own key. The choice lives in the same ~/.steve/credentials.json the
// Settings page writes, so switching providers never means editing .env.

/** Neither Anthropic nor the Gemini route is wired for embeddings here, so
 *  retrieval always runs on OpenAI — directly when there's an OpenAI key,
 *  through the Gateway otherwise. */
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const GATEWAY_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** Vector width of the model above. Chunks embedded with a different model
 *  can't be compared against these, so the dimension is worth pinning. */
export const EMBEDDING_DIMENSIONS = 1536;

function credential(
  key: "AI_GATEWAY_API_KEY" | "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GOOGLE_GENERATIVE_AI_API_KEY",
): string | undefined {
  const value = getCredentialSync(key);
  return value && value.length > 0 ? value : undefined;
}

/**
 * The configured provider. An explicit choice in Settings wins; otherwise we
 * infer one from whichever key exists, which keeps pre-existing .env setups
 * (where only OPENAI_API_KEY or ANTHROPIC_API_KEY was ever set) working.
 */
export function resolveProvider(): AiProvider {
  const stored = getCredentialSync("AI_PROVIDER");
  if (stored === "gateway" || stored === "openai" || stored === "anthropic" || stored === "google") {
    return stored;
  }
  if (credential("OPENAI_API_KEY")) return "openai";
  if (credential("ANTHROPIC_API_KEY")) return "anthropic";
  if (credential("GOOGLE_GENERATIVE_AI_API_KEY")) return "google";
  return "gateway";
}

/** The model id for the active provider, honoring an AI_MODEL override. */
export function resolveModelId(provider: AiProvider = resolveProvider()): string {
  const override = getCredentialSync("AI_MODEL");
  if (override && override.length > 0) return override;
  return DEFAULT_MODELS[provider];
}

/**
 * Mirror the stored keys into process.env. Eve, the AI SDK, and the Gateway
 * all read process.env directly — they have no idea the Settings page
 * persists credentials to ~/.steve/credentials.json — so a key saved in the
 * UI only takes effect once it lands here.
 */
export function applyProviderEnv(): void {
  applyModelEnv();
}

/**
 * The agent's language model. A bare string is Gateway-routed by Eve; the
 * direct providers get a configured AI SDK model instance instead.
 */
/**
 * Build a callable model. Pass `modelIdOverride` to run one specific model —
 * a per-chat pick or a per-task default — without changing what the rest of
 * the app resolves to.
 */
export function resolveLanguageModel(modelIdOverride?: string): LanguageModel {
  applyProviderEnv();
  const provider = resolveProvider();
  const modelId = modelIdOverride && modelIdOverride.length > 0
    ? modelIdOverride
    : resolveModelId(provider);

  if (provider === "openai") {
    const apiKey = credential("OPENAI_API_KEY");
    return createOpenAI(apiKey ? { apiKey } : {})(modelId);
  }

  if (provider === "anthropic") {
    const apiKey = credential("ANTHROPIC_API_KEY");
    return createAnthropic(apiKey ? { apiKey } : {})(modelId);
  }

  if (provider === "google") {
    const apiKey = credential("GOOGLE_GENERATIVE_AI_API_KEY");
    return createGoogleGenerativeAI(apiKey ? { apiKey } : {})(modelId);
  }

  return modelId;
}

export type EmbeddingSetup = {
  readonly model: EmbeddingModel;
  readonly modelId: string;
  readonly route: "openai" | "gateway";
};

/**
 * The embedding model used to index and search the knowledge base. Returns
 * `null` when neither an OpenAI key nor a Gateway key is configured — the
 * caller turns that into a message telling the user which key to add, rather
 * than a stack trace from deep inside the AI SDK.
 */
export function resolveEmbeddingModel(): EmbeddingSetup | null {
  applyProviderEnv();

  const openaiKey = credential("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      model: createOpenAI({ apiKey: openaiKey }).embedding(OPENAI_EMBEDDING_MODEL),
      modelId: OPENAI_EMBEDDING_MODEL,
      route: "openai",
    };
  }

  if (credential("AI_GATEWAY_API_KEY")) {
    // A plain string is routed through the Gateway with AI_GATEWAY_API_KEY.
    return { model: GATEWAY_EMBEDDING_MODEL, modelId: GATEWAY_EMBEDDING_MODEL, route: "gateway" };
  }

  return null;
}

/** Human-readable reason retrieval is unavailable, for the UI and the tool. */
export const EMBEDDING_UNAVAILABLE_MESSAGE =
  "No hay credenciales para generar embeddings. Configurá OPENAI_API_KEY o AI_GATEWAY_API_KEY en Configuración → Modelo de IA.";
