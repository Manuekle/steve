// What a pipeline is worth.
//
// Pure, like lib/forms/scoring.ts and for the same reason: an operator has to
// be able to argue with a forecast. Every number on the pipeline screen is
// arithmetic over the deals on that screen — no clock beyond `now`, no store,
// no model.

import type { Deal, DealStage } from "@/lib/types";
import type { Locale } from "@/lib/i18n/dictionaries";

/** Left to right on the board. `won` and `lost` are the two ends of the same
 *  last column, which is why they are last and why nothing moves out of them
 *  except by an explicit reopen. */
export const DEAL_STAGES: readonly DealStage[] = [
  "lead",
  "qualified",
  "meeting",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

/** The stages a deal is still live in — the ones that make up "pipeline". */
export const OPEN_STAGES: readonly DealStage[] = [
  "lead",
  "qualified",
  "meeting",
  "proposal",
  "negotiation",
];

export function isOpen(deal: Deal): boolean {
  return deal.stage !== "won" && deal.stage !== "lost";
}

/**
 * How likely a deal at each stage is to close, as a fraction.
 *
 * A per-stage default rather than a number on every deal. A stored
 * probability is a field that has to be re-guessed by hand on every move and
 * is wrong the moment somebody forgets — and "how sure are you, 0 to 100" is
 * a question nobody answers honestly twice. The stage is the honest signal:
 * it is a fact about what has happened, not a feeling about what will.
 *
 * The operator can still overrule the forecast by moving the deal, which is
 * the same gesture they were going to make anyway.
 */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
  lead: 0.1,
  qualified: 0.25,
  meeting: 0.4,
  proposal: 0.6,
  negotiation: 0.8,
  won: 1,
  lost: 0,
};

/** A deal nobody has touched in this long is the one worth a nudge. Two weeks
 *  rather than a week: a proposal out on a Friday should not be nagging by the
 *  next Tuesday. */
export const STALE_AFTER_DAYS = 14;

export function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** Open, untouched for a fortnight. Closed deals are never stale — they are
 *  finished. */
export function isStale(deal: Deal, now: Date): boolean {
  return isOpen(deal) && daysSince(deal.updatedAt, now) >= STALE_AFTER_DAYS;
}

/** Open, with an expected close date already behind us. The other half of
 *  "what needs attention today". */
export function isOverdue(deal: Deal, now: Date): boolean {
  if (!isOpen(deal) || !deal.expectedCloseAt) return false;
  return new Date(deal.expectedCloseAt).getTime() < now.getTime();
}

export type CurrencyTotals = {
  readonly currency: string;
  /** Everything still open, at face value. */
  readonly open: number;
  /** The same deals, each multiplied by its stage's probability. */
  readonly forecast: number;
  readonly won: number;
  readonly lost: number;
  readonly openCount: number;
  readonly wonCount: number;
  readonly lostCount: number;
};

/**
 * Totals, one row per currency.
 *
 * Summing ARS and USD into a single "pipeline" number is the kind of figure
 * that looks fine on a dashboard and is meaningless — so the shape here is a
 * list, and a business quoting in one currency simply gets a list of one.
 * Ordered by open value, so the currency that matters leads.
 */
export function pipelineTotals(deals: readonly Deal[]): readonly CurrencyTotals[] {
  const byCurrency = new Map<string, {
    open: number; forecast: number; won: number; lost: number;
    openCount: number; wonCount: number; lostCount: number;
  }>();

  for (const deal of deals) {
    const code = deal.currency || "USD";
    const row = byCurrency.get(code) ?? {
      open: 0, forecast: 0, won: 0, lost: 0, openCount: 0, wonCount: 0, lostCount: 0,
    };
    const value = Number.isFinite(deal.value) ? deal.value : 0;
    if (deal.stage === "won") {
      row.won += value;
      row.wonCount += 1;
    } else if (deal.stage === "lost") {
      row.lost += value;
      row.lostCount += 1;
    } else {
      row.open += value;
      row.forecast += value * STAGE_PROBABILITY[deal.stage];
      row.openCount += 1;
    }
    byCurrency.set(code, row);
  }

  return [...byCurrency.entries()]
    .map(([currency, row]) => ({ currency, ...row }))
    .sort((a, b) => b.open + b.won - (a.open + a.won));
}

/**
 * Won over decided, as a fraction. Open deals are excluded rather than counted
 * as losses: a pipeline full of live deals is not a 0% win rate. `undefined`
 * when nothing has closed yet, because "0%" and "we don't know yet" are
 * different answers and only one of them is discouraging for no reason.
 */
export function winRate(deals: readonly Deal[]): number | undefined {
  const won = deals.filter((deal) => deal.stage === "won").length;
  const lost = deals.filter((deal) => deal.stage === "lost").length;
  const decided = won + lost;
  return decided === 0 ? undefined : won / decided;
}

/** The average size of a deal that was actually won, per currency. What
 *  "ticket promedio" means when it isn't inflated by deals still in play. */
export function averageWonValue(deals: readonly Deal[], currency: string): number | undefined {
  const won = deals.filter((deal) => deal.stage === "won" && deal.currency === currency);
  if (won.length === 0) return undefined;
  return won.reduce((total, deal) => total + deal.value, 0) / won.length;
}

/** How long a won deal took, in days, averaged. The number that answers "how
 *  far ahead should I be filling the top of this thing". */
export function averageDaysToClose(deals: readonly Deal[]): number | undefined {
  const closed = deals.filter((deal) => deal.stage === "won" && deal.closedAt);
  if (closed.length === 0) return undefined;
  const total = closed.reduce(
    (sum, deal) => sum + daysSince(deal.createdAt, new Date(deal.closedAt as string)),
    0,
  );
  return total / closed.length;
}

/** Where the won money came from, biggest first. `Deal.source` mirrors
 *  `Contact.source`, so this answers "which channel actually pays" rather than
 *  "which channel is loudest". */
export function wonBySource(
  deals: readonly Deal[],
  currency: string,
): ReadonlyArray<{ readonly source: string; readonly value: number; readonly count: number }> {
  const totals = new Map<string, { value: number; count: number }>();
  for (const deal of deals) {
    if (deal.stage !== "won" || deal.currency !== currency) continue;
    const key = deal.source?.trim() || "—";
    const row = totals.get(key) ?? { value: 0, count: 0 };
    row.value += deal.value;
    row.count += 1;
    totals.set(key, row);
  }
  return [...totals.entries()]
    .map(([source, row]) => ({ source, ...row }))
    .sort((a, b) => b.value - a.value);
}

/** Deals grouped by stage, every stage present even when empty — the board
 *  draws a column per stage whether or not anything is in it. */
export function byStage(deals: readonly Deal[]): Record<DealStage, Deal[]> {
  const groups = Object.fromEntries(
    DEAL_STAGES.map((stage) => [stage, [] as Deal[]]),
  ) as Record<DealStage, Deal[]>;
  for (const deal of deals) {
    // A stage this build doesn't know about (an older store, a hand-edited
    // file) lands in `lead` rather than vanishing off the board.
    (groups[deal.stage] ?? groups.lead).push(deal);
  }
  return groups;
}

/** Money, in the reader's locale. Falls back to the plain number when the
 *  currency code is one `Intl` doesn't recognise, which beats throwing inside
 *  a render. */
export function formatMoney(value: number, currency: string, locale: Locale = "es"): string {
  const tag = locale === "en" ? "en-US" : "es-AR";
  try {
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(tag)}`;
  }
}

/** The currency a new deal should start in: whatever this account already
 *  quotes in most, and otherwise the obvious one for the language. */
export function defaultCurrency(deals: readonly Deal[], locale: Locale = "es"): string {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    if (!deal.currency) continue;
    counts.set(deal.currency, (counts.get(deal.currency) ?? 0) + 1);
  }
  const [most] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return most?.[0] ?? (locale === "en" ? "USD" : "ARS");
}
