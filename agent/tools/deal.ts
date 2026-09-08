import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  createDeal,
  getContactBySession,
  listContacts,
  listDeals,
  normalizePhone,
  updateDeal,
} from "../../lib/business-store";
import { DEAL_STAGES, STAGE_PROBABILITY, formatMoney } from "../../lib/deals";
import { assertToolAllowed } from "../../lib/agent-scope";

/**
 * The pipeline, from the agent's side.
 *
 * The point of a CRM inside an agent app is that the conversation and the deal
 * are the same event: someone asks what it costs on WhatsApp, and the deal
 * should exist by the time the operator opens the board — not after they read
 * the transcript that evening.
 *
 * Three actions rather than three tools, because they share every argument and
 * a model choosing between `create_deal`, `move_deal` and `list_deals` picks
 * wrong more often than one choosing an `action`.
 */
export default defineTool({
  description:
    "Track a sales opportunity for a contact: open one, move it along the pipeline, " +
    "or list what is open. Use this when a conversation turns into something with a " +
    "price attached — a quote asked for, a proposal sent, an order agreed or lost. " +
    "Stages run lead → qualified → meeting → proposal → negotiation → won/lost. " +
    "Do not open a second deal for something already in the list; move that one instead.",
  inputSchema: z.object({
    action: z
      .enum(["create", "update", "list"])
      .describe("create a new deal, update an existing one, or list this contact's deals."),
    dealId: z.string().optional().describe("Deal id (dl-...). Required for action=update."),
    contactId: z
      .string()
      .optional()
      .describe("Contact id (ct-...). Defaults to the current session's contact."),
    phone: z.string().optional().describe("Match a contact by phone when no id is known."),
    title: z
      .string()
      .optional()
      .describe("What the deal is for, in the customer's own words. Required for action=create."),
    value: z
      .number()
      .optional()
      .describe("Amount in whole currency units, e.g. 1500.5. Use 0 when it isn't priced yet."),
    currency: z.string().optional().describe("ISO 4217 code, e.g. ARS or USD."),
    stage: z.enum(["lead", "qualified", "meeting", "proposal", "negotiation", "won", "lost"])
      .optional()
      .describe("Where the deal stands. Defaults to lead on create."),
    expectedCloseAt: z
      .string()
      .optional()
      .describe("When it should be decided, as YYYY-MM-DD."),
    notes: z.string().optional().describe("Anything the operator should read before following up."),
    lostReason: z.string().optional().describe("Why it was lost. Only used with stage=lost."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    dealId: z.string().optional(),
    summary: z.string().optional(),
    deals: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          value: z.number(),
          currency: z.string(),
          stage: z.string(),
          odds: z.number(),
        }),
      )
      .optional(),
    error: z.string().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "deal");

    // Resolve who this is about. The session's own contact first, because in a
    // live conversation that is nearly always the answer and asking the model
    // to carry an id around is how it invents one.
    let contactId = input.contactId;
    if (!contactId) {
      const bySession = await getContactBySession(ctx.session.id);
      contactId = bySession?.id;
    }
    if (!contactId && input.phone) {
      const wanted = normalizePhone(input.phone);
      contactId = (await listContacts()).find((c) => normalizePhone(c.phone) === wanted)?.id;
    }

    if (input.action === "list") {
      if (!contactId) return { ok: false, error: "No contact to list deals for." };
      const deals = await listDeals(contactId);
      return {
        ok: true,
        deals: deals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          value: deal.value,
          currency: deal.currency,
          stage: deal.stage,
          odds: STAGE_PROBABILITY[deal.stage],
        })),
      };
    }

    if (input.action === "update") {
      if (!input.dealId) return { ok: false, error: "dealId is required to update a deal." };
      const updated = await updateDeal(input.dealId, {
        title: input.title,
        value: input.value,
        currency: input.currency?.toUpperCase(),
        stage: input.stage,
        expectedCloseAt: input.expectedCloseAt
          ? new Date(input.expectedCloseAt).toISOString()
          : undefined,
        notes: input.notes,
        lostReason: input.lostReason,
      });
      if (!updated) return { ok: false, error: `No deal with id ${input.dealId}.` };
      return {
        ok: true,
        dealId: updated.id,
        summary: `${updated.title} — ${formatMoney(updated.value, updated.currency)} (${updated.stage})`,
      };
    }

    if (!contactId) return { ok: false, error: "No contact to open a deal for." };
    if (!input.title) return { ok: false, error: "title is required to create a deal." };

    const created = await createDeal({
      contactId,
      title: input.title,
      value: input.value ?? 0,
      // Falls back to whatever this account already quotes in rather than to a
      // hardcoded code, so a model that omits it doesn't relabel the pipeline.
      currency: (input.currency ?? currencyInUse(await listDeals())).toUpperCase(),
      stage: input.stage ?? "lead",
      expectedCloseAt: input.expectedCloseAt
        ? new Date(input.expectedCloseAt).toISOString()
        : undefined,
      notes: input.notes,
      source: `agent:${ctx.session.id.slice(0, 12)}`,
    });

    return {
      ok: true,
      dealId: created.id,
      summary: `${created.title} — ${formatMoney(created.value, created.currency)} (${created.stage})`,
    };
  },
});

/** The account's most-used currency, or ARS. Mirrors `defaultCurrency` in
 *  lib/deals.ts without pulling the locale in — the agent has no UI language. */
function currencyInUse(deals: readonly { currency: string }[]): string {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    if (deal.currency) counts.set(deal.currency, (counts.get(deal.currency) ?? 0) + 1);
  }
  const [most] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return most?.[0] ?? "ARS";
}

// Keeps the stage list here honest against lib/deals.ts: the enum above is
// spelled out for the model's benefit, and a stage added there without adding
// it here would silently become unreachable from a conversation.
const _stagesCovered: readonly string[] = DEAL_STAGES;
void _stagesCovered;
