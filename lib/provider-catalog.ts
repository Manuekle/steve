import { getCredentialSync } from "./credentials";
import { resolveProvider, type AiProvider } from "./ai-provider";
import { FALLBACK_MODEL, MODEL_TASKS, preferencesFor, type CatalogModel } from "./model-catalog";
import { readAccessSync, writeAccess } from "./model-access";

// Live model catalog and key health, straight from each provider.
//
// Two questions, answered from the provider itself rather than from anything
// we store: which models can this key actually call, and is the key in a
// state where a call would succeed. "Valid" is not enough — a key can
// authenticate perfectly and still fail every request because the account has
// no credit, so that case gets its own status.

export type ProviderStatus =
  /** Authenticated, and nothing suggests a call would be refused. */
  | "ok"
  /** The key is missing from the store and the environment. */
  | "missing"
  /** The provider rejected the key (401/403). */
  | "invalid"
  /** The key works but the account cannot pay for a call. */
  | "no_credit"
  /** Authenticated, but currently rate limited. */
  | "rate_limited"
  /** The key works and has balance, but the plan only reaches part of the
   *  catalog — Vercel's free Gateway credits behave this way. */
  | "free_tier"
  /** We could not reach the provider at all. */
  | "unreachable";

export type ProviderReport = {
  readonly provider: AiProvider;
  readonly status: ProviderStatus;
  /** Human-readable reason, straight from the provider when it gave one. */
  readonly detail?: string;
  readonly models: readonly CatalogModel[];
  /** Remaining Gateway credit in USD. Gateway only — the direct providers
   *  publish no balance endpoint. */
  readonly balanceUsd?: number;
  /** Whether the paid-account probe ran (it costs a token or two). */
  readonly billingChecked: boolean;
  /** Models the probe found this account cannot call, and why. */
  readonly restricted?: Readonly<Record<string, string>>;
  readonly checkedAt: string;
};

const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

/** Catalogs change on the order of days; a minute of staleness is invisible
 *  to the user and keeps a page refresh from re-fetching 200+ models. */
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { report: ProviderReport; expires: number }>();

function keyFor(provider: AiProvider): "AI_GATEWAY_API_KEY" | "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" {
  return provider === "openai"
    ? "OPENAI_API_KEY"
    : provider === "anthropic"
      ? "ANTHROPIC_API_KEY"
      : "AI_GATEWAY_API_KEY";
}

function credential(provider: AiProvider): string | undefined {
  const value = getCredentialSync(keyFor(provider));
  return value && value.length > 0 ? value : undefined;
}

function toNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Provider pricing is per token; per million reads better everywhere else. */
function perMillion(value: unknown): number | undefined {
  const parsed = toNumber(value);
  return parsed === undefined ? undefined : parsed * 1_000_000;
}

type RawModel = {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  type?: unknown;
  modelType?: unknown;
  context_window?: unknown;
  pricing?: { input?: unknown; output?: unknown } | null;
};

function normalizeGatewayModel(raw: RawModel): CatalogModel | null {
  if (typeof raw.id !== "string") return null;
  // The catalog also carries image, video, speech, and embedding models. Only
  // language models can serve a chat turn.
  const kind = raw.type ?? raw.modelType ?? "language";
  if (kind !== "language") return null;
  return {
    id: raw.id,
    label: typeof raw.name === "string" ? raw.name : raw.id,
    vendor: raw.id.includes("/") ? raw.id.split("/")[0] : "gateway",
    inputPerMillion: perMillion(raw.pricing?.input),
    outputPerMillion: perMillion(raw.pricing?.output),
    contextWindow: toNumber(raw.context_window),
  };
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Some error responses are empty; the status code still carries meaning.
  }
  return { status: response.status, body };
}

/** Pull the provider's own error message out of whatever envelope it uses. */
function errorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
    if (typeof nested.type === "string") return nested.type;
  }
  if (typeof record.message === "string") return record.message;
  return undefined;
}

/** Map a provider's refusal onto our status vocabulary. The distinction that
 *  matters is "wrong key" versus "right key, unpaid account" — they look
 *  identical in the UI otherwise, and the fix is completely different. */
function statusFromError(httpStatus: number, message: string | undefined): ProviderStatus {
  const text = (message ?? "").toLowerCase();
  if (
    text.includes("insufficient_quota") ||
    text.includes("insufficient quota") ||
    text.includes("credit balance") ||
    text.includes("billing") ||
    text.includes("payment") ||
    text.includes("exceeded your current quota")
  ) {
    return "no_credit";
  }
  if (httpStatus === 401 || httpStatus === 403) return "invalid";
  if (httpStatus === 429) return "rate_limited";
  return "unreachable";
}

/** Refusals that mean "your plan does not reach this model" rather than
 *  "your key is wrong" or "you are out of money". */
function isAccessRefusal(message: string | undefined): boolean {
  const text = (message ?? "").toLowerCase();
  return (
    text.includes("free tier") ||
    text.includes("do not have access") ||
    text.includes("does not have access") ||
    text.includes("not available on your plan") ||
    text.includes("upgrade")
  );
}

/**
 * Ask the Gateway, one cheap token at a time, whether this account can call
 * the models the app would pick on its own. Being in the catalog is not the
 * same as being callable, and the only way to know is to try.
 */
async function probeGatewayAccess(
  key: string,
  candidates: readonly string[],
): Promise<Record<string, string>> {
  const restricted: Record<string, string> = {};

  await Promise.all(
    candidates.map(async (model) => {
      try {
        const trial = await fetchJson(
          `${GATEWAY_BASE}/chat/completions`,
          { Authorization: `Bearer ${key}`, "content-type": "application/json" },
          {
            method: "POST",
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: "hi" }],
              max_tokens: 1,
            }),
          },
        );
        if (trial.status >= 400) {
          const message = errorMessage(trial.body);
          if (isAccessRefusal(message)) {
            restricted[model] = message ?? "restricted";
          }
        }
      } catch {
        // A network blip is not evidence of a restriction; leave it unmarked.
      }
    }),
  );

  return restricted;
}

async function reportGateway(key: string, probe: boolean): Promise<Omit<ProviderReport, "provider" | "checkedAt">> {
  const auth = { Authorization: `Bearer ${key}` };

  const models = await fetchJson(`${GATEWAY_BASE}/models`, auth);
  if (models.status >= 400) {
    const message = errorMessage(models.body);
    return {
      status: statusFromError(models.status, message),
      detail: message,
      models: [],
      billingChecked: false,
    };
  }

  const raw = models.body as { models?: RawModel[]; data?: RawModel[] };
  const list = (raw.models ?? raw.data ?? [])
    .map(normalizeGatewayModel)
    .filter((model): model is CatalogModel => model !== null)
    .sort((a, b) => a.id.localeCompare(b.id));

  // The Gateway publishes the balance, so "is this account paid up" is a
  // straight read — no need to spend a token probing for it.
  const credits = await fetchJson(`${GATEWAY_BASE}/credits`, auth);
  const balance =
    credits.status < 400 ? toNumber((credits.body as { balance?: unknown })?.balance) : undefined;

  if (balance !== undefined && balance <= 0) {
    return { status: "no_credit", models: list, balanceUsd: balance, billingChecked: true };
  }

  // Without a probe, report what the balance alone can support and reuse
  // whatever an earlier probe already learned about restricted models.
  if (!probe) {
    const known = readAccessSync().restricted;
    return {
      status: Object.keys(known).length > 0 ? "free_tier" : "ok",
      models: list,
      balanceUsd: balance,
      billingChecked: credits.status < 400,
      restricted: known,
    };
  }

  // Probe exactly the models the app would choose by itself — the ones whose
  // being blocked would actually break something.
  // Every ranked candidate, not just the top of each list: a restriction on
  // the second choice is what silently pushes a task onto the third, and the
  // third would be just as blocked if nobody checked it. Eight one-token
  // calls, issued in parallel.
  const candidates = [
    ...new Set(MODEL_TASKS.flatMap((task) => [...preferencesFor("gateway", task)])),
  ].filter((id) => list.some((model) => model.id === id));

  const restricted = await probeGatewayAccess(key, candidates);
  await writeAccess(restricted);

  const blocked = Object.keys(restricted);
  return {
    status: blocked.length > 0 ? "free_tier" : "ok",
    detail: blocked.length > 0 ? restricted[blocked[0]] : undefined,
    models: list,
    balanceUsd: balance,
    billingChecked: true,
    restricted,
  };
}

async function reportOpenai(key: string, probe: boolean): Promise<Omit<ProviderReport, "provider" | "checkedAt">> {
  const auth = { Authorization: `Bearer ${key}` };

  const models = await fetchJson(`${OPENAI_BASE}/models`, auth);
  if (models.status >= 400) {
    const message = errorMessage(models.body);
    return { status: statusFromError(models.status, message), detail: message, models: [], billingChecked: false };
  }

  const list = ((models.body as { data?: RawModel[] }).data ?? [])
    .map((raw): CatalogModel | null =>
      typeof raw.id === "string"
        ? { id: raw.id, label: raw.id, vendor: "openai" }
        : null,
    )
    .filter((model): model is CatalogModel => model !== null)
    // Only the text models can serve a turn; the account also lists audio,
    // image, embedding, and moderation models.
    .filter((model) => /^(gpt|o\d|chatgpt)/.test(model.id))
    .filter((model) => !/(audio|realtime|image|tts|transcribe|whisper|embedding|moderation)/.test(model.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (!probe) {
    return { status: "ok", models: list, billingChecked: false };
  }

  // A listing succeeds on an unpaid account; only a real completion reveals
  // `insufficient_quota`. One token is the cheapest question we can ask.
  const trial = await fetchJson(
    `${OPENAI_BASE}/chat/completions`,
    { ...auth, "content-type": "application/json" },
    {
      method: "POST",
      body: JSON.stringify({
        model: list.find((m) => m.id.startsWith("gpt-5-nano"))?.id ?? list[0]?.id ?? "gpt-5-nano",
        messages: [{ role: "user", content: "hi" }],
        max_completion_tokens: 1,
      }),
    },
  );

  if (trial.status >= 400) {
    const message = errorMessage(trial.body);
    return { status: statusFromError(trial.status, message), detail: message, models: list, billingChecked: true };
  }

  return { status: "ok", models: list, billingChecked: true };
}

async function reportAnthropic(key: string, probe: boolean): Promise<Omit<ProviderReport, "provider" | "checkedAt">> {
  const auth = { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION };

  const models = await fetchJson(`${ANTHROPIC_BASE}/models?limit=100`, auth);
  if (models.status >= 400) {
    const message = errorMessage(models.body);
    return { status: statusFromError(models.status, message), detail: message, models: [], billingChecked: false };
  }

  const list = ((models.body as { data?: RawModel[] }).data ?? [])
    .map((raw): CatalogModel | null =>
      typeof raw.id === "string"
        ? {
            id: raw.id,
            label: typeof raw.display_name === "string" ? raw.display_name : raw.id,
            vendor: "anthropic",
          }
        : null,
    )
    .filter((model): model is CatalogModel => model !== null)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (!probe) {
    return { status: "ok", models: list, billingChecked: false };
  }

  const trial = await fetchJson(
    `${ANTHROPIC_BASE}/messages`,
    { ...auth, "content-type": "application/json" },
    {
      method: "POST",
      body: JSON.stringify({
        model: list.find((m) => m.id.includes("haiku"))?.id ?? list[0]?.id ?? "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    },
  );

  if (trial.status >= 400) {
    const message = errorMessage(trial.body);
    return { status: statusFromError(trial.status, message), detail: message, models: list, billingChecked: true };
  }

  return { status: "ok", models: list, billingChecked: true };
}

/**
 * Catalog and health for one provider.
 *
 * `probe` spends a one-token completion to find out whether the account can
 * actually pay — off by default, on when the user presses "check" in
 * Settings. The Gateway never needs it: it reports a balance directly.
 */
export async function getProviderReport(
  provider: AiProvider = resolveProvider(),
  { probe = false, force = false }: { probe?: boolean; force?: boolean } = {},
): Promise<ProviderReport> {
  const cacheKey = `${provider}:${probe}`;
  const hit = cache.get(cacheKey);
  if (!force && hit && hit.expires > Date.now()) return hit.report;

  const key = credential(provider);
  if (!key) {
    const report: ProviderReport = {
      provider,
      status: "missing",
      models: [],
      billingChecked: false,
      checkedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, { report, expires: Date.now() + CACHE_TTL_MS });
    return report;
  }

  let partial: Omit<ProviderReport, "provider" | "checkedAt">;
  try {
    partial =
      provider === "openai"
        ? await reportOpenai(key, probe)
        : provider === "anthropic"
          ? await reportAnthropic(key, probe)
          : await reportGateway(key, probe);
  } catch (error) {
    partial = {
      status: "unreachable",
      detail: error instanceof Error ? error.message : String(error),
      models: [],
      billingChecked: false,
    };
  }

  const report: ProviderReport = { provider, ...partial, checkedAt: new Date().toISOString() };
  cache.set(cacheKey, { report, expires: Date.now() + CACHE_TTL_MS });
  return report;
}

/** Models the active provider can serve, or an empty list when it can't be
 *  reached. Callers that need a model anyway use FALLBACK_MODEL. */
export async function listModels(provider: AiProvider = resolveProvider()): Promise<readonly CatalogModel[]> {
  return (await getProviderReport(provider)).models;
}

export { FALLBACK_MODEL };
