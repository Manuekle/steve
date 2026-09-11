import { SITE_URL } from "./site";

// A reader for the runtime's own inspection endpoint.
//
// `GET /eve/v1/info` is Eve's answer to "what is actually loaded right now":
// the model, the instructions, every authored and framework tool, the skills,
// channels, schedules, subagents, sandbox, connections and hooks. It is the
// difference between a runtime page that reports what the *repository* says
// and one that reports what the *process* did — after dynamic resolvers ran,
// after a tool was disabled, after a subagent directory was added.
//
// Where it lives depends on how this install runs. With `withEve()` (the
// default, see next.config.ts) the runtime is mounted inside this same Next
// server, so the origin is our own. Self-hosted, `eve start` is a separate
// process on :3000 while Next serves :3001, and EVE_SELF_HOSTED=1 is what
// says so.

/**
 * The runtime's origin, most specific source first.
 *
 * `requestOrigin` — the origin the browser actually reached this Next server
 * on — comes before `SITE_URL` deliberately. Under `withEve()` the runtime is
 * mounted *in this same server*, so whatever origin served the page also
 * serves `/eve/v1`, always. `NEXT_PUBLIC_SITE_URL` is the app's canonical
 * public URL, which on a dev machine is routinely something the dev server
 * cannot resolve (`https://senka.localhost`); trusting it here reported a
 * healthy runtime as a 404.
 */
export function eveRuntimeUrl(requestOrigin?: string): string {
  const configured = process.env.EVE_RUNTIME_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.EVE_SELF_HOSTED === "1") {
    // A separate process: `eve start` on :3000 while Next serves :3001.
    return process.env.EVE_HOST_URL?.trim() || "http://127.0.0.1:3000";
  }
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  return SITE_URL.replace(/\/+$/, "");
}

export type EveToolInfo = {
  readonly name: string;
  readonly description?: string;
  /** Eve distinguishes what the repo authored from what the framework
   *  provides; the runtime page shows the two apart because only one of them
   *  is anybody's to change. */
  readonly source?: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
};

export type EveInfo = {
  readonly agent?: { readonly name?: string; readonly model?: string };
  readonly model?: unknown;
  readonly instructions?: unknown;
  readonly tools?: unknown;
  readonly skills?: unknown;
  readonly channels?: unknown;
  readonly schedules?: unknown;
  readonly subagents?: unknown;
  readonly sandbox?: unknown;
  readonly connections?: unknown;
  readonly hooks?: unknown;
  readonly workflow?: unknown;
  readonly workspace?: unknown;
  readonly [key: string]: unknown;
};

/** Why the snapshot could not be read. A dictionary key, not a sentence: the
 *  runtime page renders in whichever language the reader picked. */
export type EveInfoError =
  | "runtime.infoUnauthorized"
  | "runtime.infoStatus"
  | "runtime.infoTimeout"
  | "runtime.infoUnreachable";

export type EveInfoResult =
  | { readonly ok: true; readonly info: EveInfo; readonly url: string }
  | {
      readonly ok: false;
      readonly error: EveInfoError;
      /** Filled into the message — an HTTP status, a socket error. */
      readonly errorParams?: Readonly<Record<string, string>>;
      readonly url: string;
      readonly status?: number;
    };

/**
 * Fetch the snapshot.
 *
 * `cookie` is forwarded on purpose: in production the eve channel authorizes
 * with the app's own session (agent/channels/eve.ts), so a server-to-server
 * call with no cookie gets a 401 and the page would report the runtime as
 * down when it is merely private.
 */
export async function fetchEveInfo(options?: {
  readonly cookie?: string | null;
  readonly timeoutMs?: number;
  /** The origin this request arrived on. See `eveRuntimeUrl`. */
  readonly requestOrigin?: string;
}): Promise<EveInfoResult> {
  const base = eveRuntimeUrl(options?.requestOrigin);
  const url = `${base}/eve/v1/info`;
  const controller = new AbortController();
  // `AbortSignal.timeout` would be shorter, but the returned signal cannot be
  // cleared — a 5s timer per call would keep the event loop busy after a fast
  // response. The handle is only kept to clear it in `finally`.
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 5_000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(options?.cookie ? { cookie: options.cookie } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const unauthorized = response.status === 401 || response.status === 403;
      return {
        ok: false,
        url,
        status: response.status,
        error: unauthorized ? "runtime.infoUnauthorized" : "runtime.infoStatus",
        errorParams: { status: String(response.status) },
      };
    }
    return { ok: true, url, info: (await response.json()) as EveInfo };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    return {
      ok: false,
      url,
      error: aborted ? "runtime.infoTimeout" : "runtime.infoUnreachable",
      errorParams: { reason: (error as Error)?.message ?? "network error" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The entries of one `/eve/v1/info` slot, flattened.
 *
 * The snapshot does not use one shape for every slot, and the differences are
 * meaningful rather than accidental: `tools` is split into
 * `{ available, authored, framework, dynamic, disabledFramework, reserved }`
 * because "authored in this repo" and "the model can call it right now" are
 * different questions; `skills` splits `static` from `dynamic`; `subagents`
 * nests under `local`; `schedules` and `hooks` are plain arrays.
 *
 * `keys` names the sub-lists to read. A slot that is already a plain array is
 * returned as-is, so the same call works against every shape.
 */
function slotEntries(slot: unknown, keys: readonly string[]): unknown[] {
  if (!slot) return [];
  if (Array.isArray(slot)) return slot;
  if (typeof slot !== "object") return [];
  const record = slot as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

/** One entry's label. Eve stamps `name` on tools, subagents and skills;
 *  dynamic skills carry `slug` instead, and `disabledFramework` is a bare
 *  string array. */
function labelOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  for (const key of ["name", "slug", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/** Which sub-lists each slot is read from. */
export const SLOT_KEYS = {
  tools: ["available", "authored"],
  skills: ["static", "dynamic"],
  subagents: ["local"],
  connections: ["connections"],
  channels: ["authored"],
  schedules: ["schedules"],
  hooks: ["hooks"],
} as const;

/**
 * Labels for one slot, deduplicated and sorted.
 *
 * Every listed key is read and the results are merged, rather than taking the
 * first that exists. Two slots need it: `skills`, where the packaged ones are
 * `static` and the authored operator ones are `dynamic` — showing one half
 * would misreport the surface — and `tools`, where `authored` is a subset of
 * `available` on a current runtime and the only list present on an older one.
 * Deduplication is what makes merging safe in both cases.
 */
export function namesOf(slot: unknown, keys: readonly string[] = []): string[] {
  const lists = keys.length > 0 ? keys.flatMap((key) => slotEntries(slot, [key])) : slotEntries(slot, []);
  const labels = lists.map(labelOf).filter((name): name is string => !!name);
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

/** How many, counting the same lists `namesOf` reads. */
export function countOf(slot: unknown, keys: readonly string[] = []): number {
  return namesOf(slot, keys).length;
}

/** Framework tools this agent has switched off — `disableTool()` in
 *  agent/tools/*.ts. Worth its own row: "the agent cannot browse the web" is a
 *  decision somebody made, and reading it as an absence loses that. */
export function disabledTools(slot: unknown): string[] {
  return slotEntries(slot, ["disabledFramework"])
    .map(labelOf)
    .filter((name): name is string => !!name);
}
