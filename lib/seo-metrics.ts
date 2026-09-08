// The arithmetic behind the SEO panel.
//
// Split out from lib/search-console.ts, which holds the transport and reaches
// for the connection store and node:crypto to authenticate. The page needs the
// shapes and the comparisons in the browser; importing them from the client
// through that module pulled the whole server half into the bundle. Nothing
// here talks to anything — pure functions over plain data, which is also what
// makes them the part worth testing.

/**
 * How far behind "today" the freshest complete day is.
 *
 * Search Console finalises a day roughly two days later, and the partial days
 * in between arrive with a fraction of their eventual clicks. Charting them
 * draws a cliff at the right edge of every graph and makes every comparison
 * report a collapse that is really just data that has not landed yet, so the
 * window ends here instead.
 */
const FINAL_DATA_LAG_DAYS = 2;

// ── Dates ──────────────────────────────────────────────────────────
//
// All of these are pure and take the day as a `YYYY-MM-DD` string, which is
// what the API speaks. Doing the arithmetic on `Date` objects in the server's
// local zone put the boundary a day out for anyone east of UTC.

/** A day as Search Console writes it, in UTC. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `day` moved by `delta` days. Negative moves back. */
export function shiftDays(day: string, delta: number): string {
  const shifted = new Date(`${day}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + delta);
  return isoDay(shifted);
}

/** Whole days from `from` to `to`, inclusive of both ends. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export type RangeId = "7d" | "28d" | "90d" | "180d" | "365d";

export const RANGE_IDS: readonly RangeId[] = ["7d", "28d", "90d", "180d", "365d"];

export const RANGE_DAYS: Readonly<Record<RangeId, number>> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

export function isRangeId(value: unknown): value is RangeId {
  return typeof value === "string" && (RANGE_IDS as readonly string[]).includes(value);
}

export type Period = { readonly start: string; readonly end: string };

/**
 * The window a range names, and the equal window immediately before it.
 *
 * Immediately before, not "the same dates last month": search traffic has a
 * weekday shape, and 28 against 28 lines those up where 28 against a calendar
 * month does not. The two never overlap — `previous` ends the day before
 * `current` starts — so a day is never counted in both halves of a delta.
 */
export function periodsFor(
  range: RangeId,
  now: Date = new Date(),
): { readonly current: Period; readonly previous: Period } {
  const days = RANGE_DAYS[range];
  const end = shiftDays(isoDay(now), -FINAL_DATA_LAG_DAYS);
  const start = shiftDays(end, -(days - 1));
  const previousEnd = shiftDays(start, -1);
  return {
    current: { start, end },
    previous: { start: shiftDays(previousEnd, -(days - 1)), end: previousEnd },
  };
}

// ── Row shapes ─────────────────────────────────────────────────────

export type SearchRow = {
  /** The dimension value: the query typed, the page's URL, "MOBILE", "esp". */
  readonly key: string;
  readonly clicks: number;
  readonly impressions: number;
  /** 0–1, as Google returns it. Formatted at the edge, not here. */
  readonly ctr: number;
  /** Average position, counting from 1. Lower is better. */
  readonly position: number;
};

export type Totals = {
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number;
  readonly position: number;
};

export const EMPTY_TOTALS: Totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

export type Dimension = "query" | "page" | "country" | "device" | "date";

// ── Movement ───────────────────────────────────────────────────────

export type Direction = "up" | "down" | "flat";

export type MetricDelta = {
  readonly current: number;
  readonly previous: number;
  /** Absolute change, `current - previous`. */
  readonly change: number;
  /** Share of the previous value, as a fraction. `null` when there is nothing
   *  to divide by — growth from zero is not "infinite percent", it is new. */
  readonly percent: number | null;
  /**
   * Which way the number moved, before anyone decides whether that is good.
   * Position is the metric where the two part company: it fell, and that is a
   * win, which is why tone is chosen by the caller and not here.
   */
  readonly direction: Direction;
};

export function metricDelta(current: number, previous: number): MetricDelta {
  const change = current - previous;
  return {
    current,
    previous,
    change,
    percent: previous === 0 ? null : change / previous,
    // A hair either side of equal is noise, not a trend — average position
    // arrives with a decimal tail and would otherwise never read as flat.
    direction: Math.abs(change) < 1e-9 ? "flat" : change > 0 ? "up" : "down",
  };
}

export type ComparedRow = {
  readonly key: string;
  readonly current: SearchRow;
  /** Absent when the term brought nothing in the earlier window. A query that
   *  did not exist before is a different finding from one that grew, and the
   *  panel says so rather than printing "+100%". */
  readonly previous?: SearchRow;
  readonly clicksChange: number;
  readonly impressionsChange: number;
  /** Percentage points, not percent: CTR is already a percentage, and
   *  "up 20%" against "up 20 points" are wildly different claims. */
  readonly ctrChange: number;
  /**
   * Signed so that a climb is positive.
   *
   * Search Console counts positions down from 1, so an improvement is a fall
   * in the raw number. Every table that printed that raw difference had to be
   * read backwards; this is `previous - current`, so +2.4 means the site moved
   * up 2.4 places, which is what the arrow next to it claims.
   */
  readonly positionChange: number;
  readonly isNew: boolean;
};

/**
 * Two windows of the same dimension, joined on the dimension value.
 *
 * Keyed rather than zipped: the two windows come back ranked by clicks, and
 * row three of one is almost never the same query as row three of the other.
 * Rows that appear only in the earlier window are dropped — a query that
 * stopped appearing entirely has no current row to render, and `lostRows`
 * below is where that story is told instead.
 */
export function compareRows(
  current: readonly SearchRow[],
  previous: readonly SearchRow[],
): ComparedRow[] {
  const before = new Map(previous.map((row) => [row.key, row]));
  return current.map((row) => {
    const prior = before.get(row.key);
    return {
      key: row.key,
      current: row,
      ...(prior ? { previous: prior } : {}),
      clicksChange: row.clicks - (prior?.clicks ?? 0),
      impressionsChange: row.impressions - (prior?.impressions ?? 0),
      ctrChange: row.ctr - (prior?.ctr ?? 0),
      positionChange: prior ? prior.position - row.position : 0,
      isNew: prior === undefined,
    };
  });
}

/**
 * Terms that brought clicks in the earlier window and none in this one.
 *
 * The one thing a table of current rows structurally cannot show: a keyword
 * that disappeared leaves no row to put a red arrow on. Ranked by what was
 * lost, because the biggest disappearance is the one worth investigating.
 */
export function lostRows(
  current: readonly SearchRow[],
  previous: readonly SearchRow[],
): SearchRow[] {
  const now = new Set(current.map((row) => row.key));
  return previous
    .filter((row) => row.clicks > 0 && !now.has(row.key))
    .sort((a, b) => b.clicks - a.clicks);
}

/** The rows that moved the most, biggest gain first, biggest loss last.
 *  Rows that did not move are left out — a mover list of flat rows is a list. */
export function rankByMovement(rows: readonly ComparedRow[], limit: number): ComparedRow[] {
  return rows
    .filter((row) => row.clicksChange !== 0)
    .sort((a, b) => b.clicksChange - a.clicksChange)
    .slice(0, limit);
}

// ── Properties ─────────────────────────────────────────────────────

export type SiteEntry = {
  readonly url: string;
  /** Google's own word: siteOwner, siteFullUser, siteRestrictedUser… */
  readonly permission: string;
};

/** The property to open on, when the operator has not picked one. A domain
 *  property first — it covers every subdomain and protocol at once, so it is
 *  almost always the one that has the whole site's traffic in it — then
 *  whatever Google listed first. */
export function defaultSite(sites: readonly SiteEntry[]): string | null {
  return sites.find((site) => site.url.startsWith("sc-domain:"))?.url ?? sites[0]?.url ?? null;
}

/** A property as a person reads it. `sc-domain:example.com` is Google's key
 *  for "the whole domain", not a URL, and printing it raw in a picker reads
 *  as a bug. */
export function siteLabel(site: string): string {
  if (site.startsWith("sc-domain:")) return site.slice("sc-domain:".length);
  return site.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// ── Impact of a logged change ──────────────────────────────────────

export type ChangeImpact = {
  /** Days of data actually found either side — not the window asked for.
   *  A change made three days ago has three days of "after", and the panel
   *  has to say so rather than quietly averaging a short week against a
   *  full one. */
  readonly beforeDays: number;
  readonly afterDays: number;
  readonly beforeAverage: number;
  readonly afterAverage: number;
  readonly delta: MetricDelta;
};

/**
 * Daily clicks either side of the day something changed.
 *
 * Averages rather than sums, because the two sides are rarely the same length:
 * a change logged four days ago has four days after it and a full week before,
 * and comparing those totals would report a collapse. The change's own day
 * counts as "after" — that is the day the new thing was live.
 *
 * This is correlation and the panel says nothing stronger. What it replaces is
 * worse: nobody remembering what was done in March, and the traffic graph
 * being unreadable as a result.
 *
 * `null` when the series holds nothing on either side — a change outside the
 * window on screen has no impact to report from what has been fetched.
 */
export function changeImpact(
  series: readonly SearchRow[],
  date: string,
  window = 7,
): ChangeImpact | null {
  const first = shiftDays(date, -window);
  const last = shiftDays(date, window - 1);

  let beforeClicks = 0;
  let beforeDays = 0;
  let afterClicks = 0;
  let afterDays = 0;

  for (const point of series) {
    if (point.key < first || point.key > last) continue;
    if (point.key < date) {
      beforeClicks += point.clicks;
      beforeDays += 1;
    } else {
      afterClicks += point.clicks;
      afterDays += 1;
    }
  }

  if (beforeDays === 0 && afterDays === 0) return null;

  const beforeAverage = beforeDays === 0 ? 0 : beforeClicks / beforeDays;
  const afterAverage = afterDays === 0 ? 0 : afterClicks / afterDays;
  return {
    beforeDays,
    afterDays,
    beforeAverage,
    afterAverage,
    delta: metricDelta(afterAverage, beforeAverage),
  };
}

// ── Formatting ─────────────────────────────────────────────────────
//
// The panel's numbers, formatted once. Four of these were being re-typed per
// card with slightly different rounding, so the same CTR read as 3.4% in the
// tile and 3.44% in the table.

export function formatCount(value: number, locale = "es"): string {
  return Math.round(value).toLocaleString(locale === "es" ? "es-ES" : "en-US");
}

/** A rate Google gives as 0–1, as a percentage. Two decimals: a site with a
 *  1.03% click rate and one with 1.4% are having different weeks. */
export function formatRate(ctr: number): string {
  return `${(ctr * 100).toFixed(2)}%`;
}

/** Average position, which is only ever interesting to one decimal. */
export function formatPosition(position: number): string {
  return position > 0 ? position.toFixed(1) : "—";
}

/** A signed change in whole units: `+128`, `-9`, `0`. */
export function formatChange(change: number, locale = "es"): string {
  const rounded = Math.round(change);
  const formatted = Math.abs(rounded).toLocaleString(locale === "es" ? "es-ES" : "en-US");
  return rounded > 0 ? `+${formatted}` : rounded < 0 ? `−${formatted}` : "0";
}

/**
 * A relative change, signed.
 *
 * `null` — growth from nothing — is deliberately not "+∞%" or "+100%": the
 * first is noise and the second is a lie. The caller prints "nuevo" instead,
 * which is the true and more useful statement.
 */
export function formatPercentChange(percent: number | null): string | null {
  if (percent === null) return null;
  const pct = percent * 100;
  const digits = Math.abs(pct) >= 10 ? 0 : 1;
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(digits)}%`;
}

/** A signed change in ranking, in places. Positive is a climb — see
 *  `positionChange`. */
export function formatPositionChange(change: number): string | null {
  if (Math.abs(change) < 0.05) return null;
  return `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}`;
}
