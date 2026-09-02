/**
 * Data shaping for charts.
 *
 * Kept away from the mark-drawing in `app/_components/chart.tsx` on purpose:
 * bucketing, gap filling and tick formatting are the parts that get argued
 * about and unit-tested, and none of them should need a React render to run.
 */

/** How many days a trailing daily series covers by default. */
export const TREND_DAYS = 14;

/** `YYYY-MM-DD` in UTC — the key a day bucket is addressed by. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type DayBucket = {
  readonly key: string;
  readonly label: string;
  readonly value: number;
};

/**
 * Count timestamps into the trailing `days` daily buckets, oldest first.
 *
 * Days with nothing in them come back as zero rather than being left out: a
 * series that drops its empty days silently redraws a quiet fortnight as a busy
 * one. Anything older than the window, unparseable, or in the future is
 * ignored rather than clamped into an edge bucket, which would invent a spike.
 *
 * Buckets are UTC days, matching how the usage ledger groups its own — a lead
 * and a spend row on the same calendar date land in the same column.
 */
export function countByDay(
  timestamps: readonly (string | Date)[],
  {
    days = TREND_DAYS,
    locale,
    now = new Date(),
  }: { readonly days?: number; readonly locale: string; readonly now?: Date },
): readonly DayBucket[] {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const counts = new Map<string, number>();
  for (const stamp of timestamps) {
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    if (Number.isNaN(date.getTime()) || date < start || date > now) continue;
    const key = dayKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    const key = dayKey(date);
    return { key, label: formatDayTick(key, locale), value: counts.get(key) ?? 0 };
  });
}

/**
 * An axis tick for a `YYYY-MM-DD` bucket — "3 sep", "Sep 3".
 *
 * Parsed and rendered in UTC, the bucket's own zone, so a reader west of
 * Greenwich is not shown the label of the day before. The year is dropped: a
 * fortnight of bars is obviously recent, and printing 2026 fourteen times is
 * fourteen times nothing.
 */
export function formatDayTick(day: string, locale: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale === "es" ? "es-AR" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
