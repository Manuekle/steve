import { defineTool } from "eve/tools";
import { z } from "zod";
import { listContacts, listDeals } from "../../lib/business-store";
import {
  averageDaysToClose,
  averageWonValue,
  byStage,
  daysSince,
  DEAL_STAGES,
  isOverdue,
  isStale,
  pipelineTotals,
  winRate,
  wonBySource,
} from "../../lib/deals";
import { assertToolAllowed } from "../../lib/agent-scope";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";
import type { Contact, Deal } from "../../lib/types";

/**
 * The pipeline read from above, rather than one contact at a time.
 *
 * `deal` answers "what is happening with the person I am talking to". Every
 * question an owner actually asks about their sales — what is the forecast,
 * what went stale, which stage leaks, who is worth calling back — is about the
 * whole board at once, and none of it was reachable from a conversation.
 *
 * Read-only on purpose. Aggregate reads and writes have different blast
 * radii: `deal` moves one deal that the operator is looking at, and a mistake
 * there is one wrong stage. A tool that could bulk-edit off the back of a
 * summary is a tool that can rewrite the pipeline from one bad inference.
 *
 * The gate is in lib/operator-console.ts: this refuses anywhere but the
 * owner's own console, because a tool that returns every customer and every
 * deal value would answer a stranger on WhatsApp with the account's CRM.
 */
export default defineTool({
  description:
    "Read the whole sales pipeline at once: totals and win rate by currency, deals grouped " +
    "by stage, the month-by-month trend, stale or overdue deals, and the contact list. " +
    "Use this for any question about " +
    "the business as a whole — the forecast, what is stuck, which stage loses deals, who has " +
    "gone quiet — as opposed to `deal`, which is about one contact. Read-only: it never " +
    "creates or moves a deal. Only available in the owner's own console, not on WhatsApp " +
    "or Instagram.",
  inputSchema: z.object({
    action: z
      .enum(["summary", "trend", "deals", "contacts"])
      .describe(
        "summary: money and rates across the board. trend: the same board bucketed by " +
          "month or week, for anything over time — chart this with `chart`. deals: the " +
          "deal rows, filtered. contacts: the people, filtered. For conversations, use " +
          "the `inbox` tool.",
      ),
    stage: z
      .array(z.enum(["lead", "qualified", "meeting", "proposal", "negotiation", "won", "lost"]))
      .optional()
      .describe("action=deals: keep only these stages. Omit for every stage."),
    granularity: z
      .enum(["month", "week"])
      .optional()
      .describe("action=trend: bucket size. Defaults to month."),
    buckets: z
      .number()
      .int()
      .min(2)
      .max(36)
      .optional()
      .describe(
        "action=trend: how many buckets back from today, newest last. Defaults to 12 " +
          "(a year of months). Use 12 for 'este año'.",
      ),
    currency: z
      .string()
      .length(3)
      .optional()
      .describe(
        "action=trend: which currency's money to total. Defaults to the one most of " +
          "the board is quoted in. Counts are currency-independent either way.",
      ),
    onlyStale: z
      .boolean()
      .optional()
      .describe("action=deals: keep only open deals untouched for 14+ days."),
    onlyOverdue: z
      .boolean()
      .optional()
      .describe("action=deals: keep only open deals past their expected close date."),
    status: z
      .enum(["open", "waiting_human", "followup_due", "closed"])
      .optional()
      .describe("action=contacts: keep only contacts in this status."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("How many rows to return. Defaults to 25, hard cap 100."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    /** action=summary */
    totals: z
      .array(
        z.object({
          currency: z.string(),
          open: z.number(),
          forecast: z.number(),
          won: z.number(),
          lost: z.number(),
          openCount: z.number(),
          wonCount: z.number(),
          lostCount: z.number(),
          averageWonValue: z.number().optional(),
        }),
      )
      .optional(),
    stageCounts: z.record(z.string(), z.number()).optional(),
    winRate: z.number().optional().describe("Won / (won + lost), 0-1. Absent until something closed."),
    averageDaysToClose: z.number().optional(),
    wonBySource: z
      .array(z.object({ source: z.string(), value: z.number(), count: z.number() }))
      .optional(),
    staleCount: z.number().optional(),
    overdueCount: z.number().optional(),
    /** action=trend */
    currency: z.string().optional(),
    trend: z
      .array(
        z.object({
          /** Sortable bucket key — "2026-03" for a month, "2026-W12" for a week. */
          bucket: z.string(),
          /** The same bucket as it should be printed on a chart axis. */
          label: z.string(),
          created: z.number(),
          won: z.number(),
          wonValue: z.number(),
          lost: z.number(),
          lostValue: z.number(),
        }),
      )
      .optional(),
    /** action=deals */
    deals: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          contact: z.string(),
          value: z.number(),
          currency: z.string(),
          stage: z.string(),
          daysSinceUpdate: z.number(),
          expectedCloseAt: z.string().optional(),
          source: z.string().optional(),
          lostReason: z.string().optional(),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    /** action=contacts */
    contacts: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          channel: z.string(),
          status: z.string(),
          source: z.string(),
          daysSinceLastMessage: z.number(),
          attributes: z.record(z.string(), z.string()),
          openDeals: z.number(),
        }),
      )
      .optional(),
    /** Set when `limit` cut the list, so the model says "the top 25 of 180"
     *  instead of reporting a filtered slice as if it were the whole board. */
    totalMatched: z.number().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "pipeline");

    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, error: OPERATOR_ONLY };
    }

    const now = new Date();
    const limit = Math.min(input.limit ?? 25, 100);
    const deals = await listDeals();

    if (input.action === "summary") {
      const grouped = byStage(deals);
      const open = deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost");
      return {
        ok: true,
        totals: pipelineTotals(deals).map((row) => ({
          currency: row.currency,
          open: round(row.open),
          forecast: round(row.forecast),
          won: round(row.won),
          lost: round(row.lost),
          openCount: row.openCount,
          wonCount: row.wonCount,
          lostCount: row.lostCount,
          averageWonValue: optionalRound(averageWonValue(deals, row.currency)),
        })),
        stageCounts: Object.fromEntries(
          DEAL_STAGES.map((stage) => [stage, grouped[stage].length]),
        ),
        winRate: optionalRound(winRate(deals)),
        averageDaysToClose: optionalRound(averageDaysToClose(deals)),
        // Only meaningful in the currency most of the board is quoted in;
        // mixing currencies into one "best source" ranking invents a number.
        wonBySource: wonBySource(deals, pipelineTotals(deals)[0]?.currency ?? "").map((row) => ({
          source: row.source,
          value: round(row.value),
          count: row.count,
        })),
        staleCount: open.filter((deal) => isStale(deal, now)).length,
        overdueCount: open.filter((deal) => isOverdue(deal, now)).length,
      };
    }

    if (input.action === "trend") {
      const currency = input.currency ?? pipelineTotals(deals)[0]?.currency ?? "";
      return {
        ok: true,
        currency,
        trend: bucketDeals(deals, currency, input.granularity ?? "month", input.buckets ?? 12, now),
      };
    }

    const contacts = await listContacts();
    const nameById = new Map(contacts.map((row) => [row.id, row.name] as const));

    if (input.action === "deals") {
      const wanted = new Set(input.stage ?? DEAL_STAGES);
      const matched = deals
        .filter((deal) => wanted.has(deal.stage))
        .filter((deal) => !input.onlyStale || isStale(deal, now))
        .filter((deal) => !input.onlyOverdue || isOverdue(deal, now))
        // Most recently touched first: the answer to "what is happening" is
        // almost never the deal nobody has looked at since March.
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      return {
        ok: true,
        totalMatched: matched.length,
        deals: matched.slice(0, limit).map((deal) => dealRow(deal, nameById, now)),
      };
    }

    const openByContact = new Map<string, number>();
    for (const deal of deals) {
      if (deal.stage === "won" || deal.stage === "lost") continue;
      openByContact.set(deal.contactId, (openByContact.get(deal.contactId) ?? 0) + 1);
    }

    const matched = contacts
      .filter((row) => !input.status || row.status === input.status)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

    return {
      ok: true,
      totalMatched: matched.length,
      contacts: matched.slice(0, limit).map((row) => contactRow(row, openByContact, now)),
    };
  },
});

function dealRow(deal: Deal, nameById: Map<string, string>, now: Date) {
  return {
    id: deal.id,
    title: deal.title,
    contact: nameById.get(deal.contactId) ?? "(sin contacto)",
    value: deal.value,
    currency: deal.currency,
    stage: deal.stage,
    daysSinceUpdate: daysSince(deal.updatedAt, now),
    expectedCloseAt: deal.expectedCloseAt,
    source: deal.source,
    lostReason: deal.lostReason,
    // Trimmed rather than dropped: the note is often the only record of why a
    // deal stalled, and a whole board of untrimmed notes is a context bomb.
    notes: deal.notes ? deal.notes.slice(0, 300) : undefined,
  };
}

function contactRow(contact: Contact, openByContact: Map<string, number>, now: Date) {
  return {
    id: contact.id,
    name: contact.name,
    channel: contact.channel,
    status: contact.status,
    source: contact.source,
    daysSinceLastMessage: daysSince(contact.lastMessageAt, now),
    attributes: contact.attributes,
    openDeals: openByContact.get(contact.id) ?? 0,
  };
}

/**
 * The board over time.
 *
 * Every "how did we do this year" question needs the same three series —
 * opened, won, lost — bucketed by a calendar unit, and none of them existed
 * anywhere in this app: the dashboard draws a total, `summary` returns a total,
 * and a total cannot show that March collapsed. Charting one meant asking the
 * model to bucket raw deal rows itself, which is an eleven-way date arithmetic
 * problem it gets subtly wrong (and which costs a `run_python` call when it
 * doesn't).
 *
 * Buckets that exist but hold nothing are returned as zeros rather than
 * skipped. A quiet August is a fact about the business; a chart that silently
 * omits it draws a twelve-month year in eleven columns and reads as growth.
 *
 * A deal is counted in the bucket of the event, not of the deal: it is
 * *created* when it was opened and *won* when it closed, so one deal can
 * appear in two buckets. `closedAt` is set the first time a deal reaches a
 * terminal stage and cleared if it reopens (see `lib/types.ts`); `updatedAt` is
 * the fallback for rows written before that field existed.
 *
 * Money is one currency at a time — adding pesos to dollars produces a number
 * that is true of nothing. Counts are currency-independent and include every
 * deal.
 */
function bucketDeals(
  deals: readonly Deal[],
  currency: string,
  granularity: "month" | "week",
  count: number,
  now: Date,
) {
  const keys: string[] = [];
  const rows = new Map<string, { created: number; lost: number; lostValue: number; won: number; wonValue: number }>();

  for (let step = count - 1; step >= 0; step -= 1) {
    const key = bucketKey(shift(now, granularity, -step), granularity);
    keys.push(key);
    rows.set(key, { created: 0, lost: 0, lostValue: 0, won: 0, wonValue: 0 });
  }

  const oldest = keys[0]!;
  for (const deal of deals) {
    const createdKey = bucketKey(new Date(deal.createdAt), granularity);
    if (createdKey >= oldest && rows.has(createdKey)) {
      rows.get(createdKey)!.created += 1;
    }

    if (deal.stage !== "won" && deal.stage !== "lost") continue;
    const closedKey = bucketKey(new Date(deal.closedAt ?? deal.updatedAt), granularity);
    const row = rows.get(closedKey);
    if (!row) continue;
    const value = deal.currency === currency ? deal.value : 0;
    if (deal.stage === "won") {
      row.won += 1;
      row.wonValue += value;
    } else {
      row.lost += 1;
      row.lostValue += value;
    }
  }

  return keys.map((key) => {
    const row = rows.get(key)!;
    return {
      bucket: key,
      created: row.created,
      label: bucketLabel(key, granularity),
      lost: row.lost,
      lostValue: round(row.lostValue),
      won: row.won,
      wonValue: round(row.wonValue),
    };
  });
}

/** UTC throughout, so a bucket boundary doesn't move with the server's zone. */
function shift(from: Date, granularity: "month" | "week", steps: number): Date {
  const date = new Date(from.getTime());
  if (granularity === "month") {
    date.setUTCMonth(date.getUTCMonth() + steps);
    return date;
  }
  date.setUTCDate(date.getUTCDate() + steps * 7);
  return date;
}

function bucketKey(date: Date, granularity: "month" | "week"): string {
  if (Number.isNaN(date.getTime())) return "";
  if (granularity === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // ISO week: Thursday of the same week decides the year, which is what keeps
  // 31 December and 1 January in one bucket when they belong to one week.
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      (thursday.getTime() - firstThursday.getTime()) / 604_800_000 -
        ((firstThursday.getUTCDay() + 6) % 7) / 7,
    );
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** "2026-03" reads as a database key on a chart axis; "mar 2026" reads as March. */
function bucketLabel(key: string, granularity: "month" | "week"): string {
  if (granularity === "week") return key.replace("-W", " S");
  const [year, month] = key.split("-");
  const name = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
  );
  return `${name.replace(".", "")} ${year}`;
}

/** Two decimals. Money that arrives as 1234.5600000000001 reads as a bug to
 *  whoever the model repeats it to. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function optionalRound(value: number | undefined): number | undefined {
  return value === undefined ? undefined : round(value);
}
