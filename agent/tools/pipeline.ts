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
    "by stage, stale or overdue deals, and the contact list. Use this for any question about " +
    "the business as a whole — the forecast, what is stuck, which stage loses deals, who has " +
    "gone quiet — as opposed to `deal`, which is about one contact. Read-only: it never " +
    "creates or moves a deal. Only available in the owner's own console, not on WhatsApp " +
    "or Instagram.",
  inputSchema: z.object({
    action: z
      .enum(["summary", "deals", "contacts"])
      .describe(
        "summary: money and rates across the board. deals: the deal rows, filtered. " +
          "contacts: the people, filtered. For conversations, use the `inbox` tool.",
      ),
    stage: z
      .array(z.enum(["lead", "qualified", "meeting", "proposal", "negotiation", "won", "lost"]))
      .optional()
      .describe("action=deals: keep only these stages. Omit for every stage."),
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

/** Two decimals. Money that arrives as 1234.5600000000001 reads as a bug to
 *  whoever the model repeats it to. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function optionalRound(value: number | undefined): number | undefined {
  return value === undefined ? undefined : round(value);
}
