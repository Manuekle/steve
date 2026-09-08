// Google Search Console, for the SEO panel.
//
// Search Console is the only place that knows what a site is actually found
// for: which query put it in front of someone, where it ranked that day, and
// whether they clicked. Analytics can tell you a visit happened; only this can
// tell you the search it came from and the position it came from — which is
// the whole subject of the SEO page.
//
// Every read here is a comparison. A number of clicks on its own says nothing
// about whether a change worked, so each window is fetched alongside the equal
// window immediately before it, and the panel reports the movement. That is
// also why the row shapes below carry `previous` rather than a bare metric:
// "trescientos clics" is trivia, "trescientos, up from ninety, and the query
// is new" is the finding.
//
// The account is whichever Google identity the install already uses — see
// lib/google-auth.ts. Nothing new is configured; the connected account needs
// the read-only Search Console scope, which lib/connections.ts now asks for.

import { getStoredConnection } from "./connection-store";
import { getGoogleToken } from "./google-auth";

/** Read-only. This panel never writes to a property, and the consent screen
 *  should say so — asking for `webmasters` would offer sitemap deletion. */
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";


// ── Errors ─────────────────────────────────────────────────────────

/** Thrown for anything Google itself refused, so a caller can tell an upstream
 *  refusal (unshared property, missing scope, quota) from a bug in here. */
export class SearchConsoleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Google's own `reason` — "insufficientPermissions", "forbidden". Kept
     *  for logs and for picking the right sentence, never shown raw. */
    readonly reason?: string,
  ) {
    super(message);
    this.name = "SearchConsoleError";
  }
}

export * from "./seo-metrics";

// Re-exported above for callers; imported here because the transport below
// needs the same shapes it hands back.
import type { Dimension, Period, SearchRow, SiteEntry, Totals } from "./seo-metrics";
import { EMPTY_TOTALS } from "./seo-metrics";

// ── Transport ──────────────────────────────────────────────────────

type RawRow = {
  readonly keys?: readonly string[];
  readonly clicks?: number;
  readonly impressions?: number;
  readonly ctr?: number;
  readonly position?: number;
};

function toRow(raw: RawRow): SearchRow {
  return {
    key: raw.keys?.[0] ?? "",
    clicks: raw.clicks ?? 0,
    impressions: raw.impressions ?? 0,
    ctr: raw.ctr ?? 0,
    position: raw.position ?? 0,
  };
}

/**
 * Whether the connected Google account granted Search Console.
 *
 * An install that connected Google before this page existed holds a perfectly
 * valid token for a narrower grant. The API answers that with a 403 that reads
 * exactly like "you do not own this property", and the fix for the two is
 * different: one is a reconnect, the other is a Search Console setting. This
 * lets the route tell them apart before it ever calls.
 *
 * `true` when there is no connected account at all — the service-account path
 * asks for the scope directly, so there is nothing stale to warn about.
 */
export async function connectionHasScope(): Promise<boolean> {
  const stored = await getStoredConnection("google");
  if (!stored || stored.needsReconnect) return true;
  return stored.scopes.includes(SEARCH_CONSOLE_SCOPE);
}

async function authorized(): Promise<string> {
  const token = await getGoogleToken(SEARCH_CONSOLE_SCOPE);
  if (!token) throw new SearchConsoleError("No Google account is connected.", 401);
  return token;
}

type GoogleErrorBody = {
  readonly error?: {
    readonly message?: string;
    readonly errors?: readonly { readonly reason?: string }[];
  };
};

async function refuse(response: Response): Promise<never> {
  let body: GoogleErrorBody | null = null;
  try {
    body = (await response.json()) as GoogleErrorBody;
  } catch {
    // A refusal that is not JSON — a proxy, a gateway. The status carries it.
  }
  const message = body?.error?.message ?? `Search Console returned ${response.status}`;
  const reason = body?.error?.errors?.[0]?.reason;
  throw new SearchConsoleError(message, response.status, reason);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await authorized();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...init?.headers,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    // Search Console is slow on a year of data with a dimension; ten seconds
    // is not enough and a hung request holds a serverless invocation open.
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) await refuse(response);
  return (await response.json()) as T;
}

// ── Reads ──────────────────────────────────────────────────────────

/**
 * The properties this account can read.
 *
 * Properties it can only see unverified are dropped: they answer every
 * analytics query with a 403, so listing them offers a choice that cannot
 * work. Domain properties (`sc-domain:example.com`) are kept as they come —
 * they cover every subdomain and protocol at once and are usually the right
 * pick, so the panel prefers them when it has to choose.
 */
export async function listSites(): Promise<SiteEntry[]> {
  const data = await call<{
    readonly siteEntry?: readonly { siteUrl?: string; permissionLevel?: string }[];
  }>("/sites");
  return (data.siteEntry ?? [])
    .filter((entry) => entry.siteUrl && entry.permissionLevel !== "siteUnverifiedUser")
    .map((entry) => ({ url: entry.siteUrl as string, permission: entry.permissionLevel ?? "" }));
}

export type AnalyticsQuery = {
  readonly site: string;
  readonly period: Period;
  /** Empty asks for the period's totals — see the note in `queryTotals`. */
  readonly dimensions?: readonly Dimension[];
  readonly rowLimit?: number;
};

async function searchAnalytics(query: AnalyticsQuery): Promise<SearchRow[]> {
  const data = await call<{ readonly rows?: readonly RawRow[] }>(
    `/sites/${encodeURIComponent(query.site)}/searchAnalytics/query`,
    {
      method: "POST",
      body: JSON.stringify({
        startDate: query.period.start,
        endDate: query.period.end,
        dimensions: query.dimensions ?? [],
        rowLimit: query.rowLimit ?? 1000,
        // Finalised data only. `all` includes the last two partial days, which
        // is what makes a fresh chart look like a crash — see the lag note.
        dataState: "final",
      }),
    },
  );
  return (data.rows ?? []).map(toRow);
}

export function queryRows(query: AnalyticsQuery & { dimensions: readonly Dimension[] }) {
  return searchAnalytics(query);
}

/**
 * One period's totals.
 *
 * Asked for without a dimension on purpose. Summing the query rows looks
 * equivalent and is not: Google withholds queries too rare to be anonymous,
 * so a `query`-dimensioned response is missing a slice of the traffic that a
 * dimensionless one includes. Adding up the visible rows under-reports clicks
 * by a fifth on a small site, and the totals on this page have to agree with
 * the totals in Search Console's own UI.
 */
export async function queryTotals(site: string, period: Period): Promise<Totals> {
  const rows = await searchAnalytics({ site, period, dimensions: [], rowLimit: 1 });
  const row = rows[0];
  if (!row) return EMPTY_TOTALS;
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}
