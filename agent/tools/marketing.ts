import { defineTool } from "eve/tools";
import { z } from "zod";
import { listContacts, listDeals, listForms, listFormResponses } from "../../lib/business-store";
import { getCampaigns, getCampaignInsightsMap, getMetaAdsConfig } from "../../lib/meta-ads";
import { maxScore } from "../../lib/forms/scoring";
import { assertToolAllowed } from "../../lib/agent-scope";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";
import type { Form, FormResponse } from "../../lib/types";

/**
 * What marketing actually did, as opposed to what it was supposed to do.
 *
 * Three numbers decide every marketing question this app can answer, and until
 * now none of them was reachable from a conversation: what the ads cost, what
 * the forms converted, and where the customers who paid came from. They live in
 * three different places — Meta's API, the form store, and the CRM — and the
 * only useful version of them is the join.
 *
 * Read-only, and console-only (lib/operator-console.ts). Nothing here creates,
 * pauses, or edits a campaign: an agent that can spend money on the strength of
 * its own read of a dashboard is a different product with a different risk.
 *
 * ## Units
 *
 * Meta reports budgets in minor units (cents) and spend in major units, which
 * is a trap worth disarming once rather than in every skill. Everything this
 * tool returns is major units — the same money the owner sees on their
 * statement.
 *
 * Which currency that is, this app does not know: the ad account carries it and
 * `MetaAdsConfig` does not read it, exactly as the Ads screen prints a bare "$".
 * So ad money is reported as a number with no currency attached, and deal money
 * (which does carry one) is never added to it.
 */

/** Meta's own action names for the two conversions this app cares about. A
 *  lead-generation campaign reports `lead`; a store campaign reports
 *  `purchase`. The ads screen reads `purchase` the same way. */
const LEAD_ACTION = "lead";
const PURCHASE_ACTION = "purchase";

export default defineTool({
  description:
    "Read what marketing produced: Meta ad campaigns with spend, clicks, leads and cost " +
    "per lead; the lead-capture forms with how many people finished them and how warm " +
    "they scored; and the funnel from where a contact came to what they eventually paid. " +
    "Read-only — it never creates, edits, pauses or funds a campaign. Only available in " +
    "the business owner's own console.",
  inputSchema: z.object({
    action: z
      .enum(["ads", "forms", "funnel"])
      .describe(
        "ads: Meta campaigns and what they cost. forms: the lead-capture forms and how " +
          "they convert. funnel: source to contact to deal to money.",
      ),
    period: z
      .enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"])
      .optional()
      .describe("action=ads: the reporting window. Defaults to last_30d, as the Ads screen does."),
    formId: z.string().optional().describe("action=forms: one form instead of all of them."),
    limit: z.number().int().min(1).max(100).optional().describe("Rows to return. Default 25."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    /** action=ads */
    period: z.string().optional(),
    campaigns: z
      .array(
        z.object({
          name: z.string(),
          status: z.string(),
          objective: z.string(),
          budget: z.number().optional(),
          budgetKind: z.string().optional(),
          spend: z.number(),
          impressions: z.number(),
          clicks: z.number(),
          ctr: z.number().optional(),
          cpc: z.number().optional(),
          leads: z.number().optional(),
          purchases: z.number().optional(),
          costPerLead: z.number().optional(),
        }),
      )
      .optional(),
    adsTotals: z
      .object({
        spend: z.number(),
        impressions: z.number(),
        clicks: z.number(),
        leads: z.number(),
        purchases: z.number(),
        costPerLead: z.number().optional(),
        activeCampaigns: z.number(),
      })
      .optional(),
    /** action=forms */
    forms: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.string(),
          url: z.string(),
          steps: z.number(),
          fields: z.number(),
          started: z.number(),
          completed: z.number(),
          completionRate: z.number().optional(),
          identified: z.number(),
          hot: z.number(),
          warm: z.number(),
          cold: z.number(),
          averageScore: z.number().optional(),
          maxScore: z.number(),
        }),
      )
      .optional(),
    /** action=funnel */
    sources: z
      .array(
        z.object({
          source: z.string(),
          contacts: z.number(),
          deals: z.number(),
          won: z.number(),
          lost: z.number(),
          wonValue: z.number(),
          currency: z.string().optional(),
        }),
      )
      .optional(),
    totalMatched: z.number().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "marketing");

    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, error: OPERATOR_ONLY };
    }

    const limit = Math.min(input.limit ?? 25, 100);

    if (input.action === "ads") {
      if (!getMetaAdsConfig()) {
        // Not a failure to retry. The owner has to connect Meta, and saying so
        // is a more useful answer than an error the model will try again.
        return {
          ok: false,
          error:
            "Meta Ads is not connected, so there is no ad data to read. It is connected " +
            "from the Ads page.",
        };
      }
      const period = input.period ?? "last_30d";
      const [campaigns, insights] = await Promise.all([
        getCampaigns(),
        getCampaignInsightsMap(period),
      ]);

      const rows = campaigns.map((campaign) => {
        const row = insights[campaign.id];
        const spend = num(row?.spend);
        const leads = actionValue(row?.actions, LEAD_ACTION);
        // Minor units on the budget, major on the spend — see the header.
        const budgetMinor = campaign.daily_budget ?? campaign.lifetime_budget;
        return {
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          budget: budgetMinor ? round(num(budgetMinor) / 100) : undefined,
          budgetKind: campaign.daily_budget ? "daily" : campaign.lifetime_budget ? "lifetime" : undefined,
          spend: round(spend),
          impressions: num(row?.impressions),
          clicks: num(row?.clicks),
          ctr: row?.ctr ? round(num(row.ctr)) : undefined,
          cpc: row?.cpc ? round(num(row.cpc)) : undefined,
          leads,
          purchases: actionValue(row?.actions, PURCHASE_ACTION),
          // The number the owner actually decides on. Undefined rather than
          // zero when nothing converted: a cost per lead of 0 reads as free.
          costPerLead: leads > 0 ? round(spend / leads) : undefined,
        };
      });

      const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
      const totalLeads = rows.reduce((sum, row) => sum + (row.leads ?? 0), 0);

      return {
        ok: true,
        period,
        totalMatched: rows.length,
        campaigns: rows
          .sort((a, b) => b.spend - a.spend)
          .slice(0, limit),
        adsTotals: {
          spend: round(totalSpend),
          impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
          clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
          leads: totalLeads,
          purchases: rows.reduce((sum, row) => sum + (row.purchases ?? 0), 0),
          costPerLead: totalLeads > 0 ? round(totalSpend / totalLeads) : undefined,
          activeCampaigns: rows.filter((row) => row.status?.toUpperCase() === "ACTIVE").length,
        },
      };
    }

    if (input.action === "forms") {
      const forms = (await listForms()).filter((form) => !input.formId || form.id === input.formId);
      const responses = await listFormResponses(input.formId);
      const byForm = new Map<string, FormResponse[]>();
      for (const response of responses) {
        const list = byForm.get(response.formId);
        if (list) list.push(response);
        else byForm.set(response.formId, [response]);
      }
      return {
        ok: true,
        totalMatched: forms.length,
        forms: forms.slice(0, limit).map((form) => formRow(form, byForm.get(form.id) ?? [])),
      };
    }

    const [contacts, deals] = await Promise.all([listContacts(), listDeals()]);
    const byContact = new Map(contacts.map((row) => [row.id, row] as const));

    type Row = {
      source: string;
      contacts: number;
      deals: number;
      won: number;
      lost: number;
      wonValue: number;
      currency?: string;
    };
    const sources = new Map<string, Row>();
    const take = (source: string): Row => {
      const existing = sources.get(source);
      if (existing) return existing;
      const created: Row = { source, contacts: 0, deals: 0, won: 0, lost: 0, wonValue: 0 };
      sources.set(source, created);
      return created;
    };

    for (const contact of contacts) take(contact.source || "desconocido").contacts += 1;
    for (const deal of deals) {
      // The deal's own source when it has one, otherwise the contact's — a
      // deal opened from a conversation inherits where that person arrived
      // from, which is the whole point of the join.
      const source = deal.source || byContact.get(deal.contactId)?.source || "desconocido";
      const row = take(source);
      row.deals += 1;
      if (deal.stage === "won") {
        row.won += 1;
        row.wonValue += deal.value;
        row.currency ??= deal.currency;
      }
      if (deal.stage === "lost") row.lost += 1;
    }

    const rows = [...sources.values()].sort((a, b) => b.wonValue - a.wonValue || b.contacts - a.contacts);
    return {
      ok: true,
      totalMatched: rows.length,
      sources: rows.slice(0, limit).map((row) => ({ ...row, wonValue: round(row.wonValue) })),
    };
  },
});

function formRow(form: Form, responses: readonly FormResponse[]) {
  const completed = responses.filter((row) => !row.partial);
  const scored = responses.filter((row) => Number.isFinite(row.score));
  const count = (temperature: FormResponse["temperature"]) =>
    responses.filter((row) => row.temperature === temperature).length;
  return {
    id: form.id,
    name: form.name,
    status: form.status,
    url: `/f/${form.slug}`,
    steps: form.steps.length,
    fields: form.steps.reduce((sum, step) => sum + step.fields.length, 0),
    // A partial response is still a lead — somebody who answered two of four
    // questions told us something — so `started` counts everyone and
    // `completed` is the subset that reached the end.
    started: responses.length,
    completed: completed.length,
    completionRate: responses.length > 0 ? round(completed.length / responses.length) : undefined,
    identified: responses.filter((row) => row.contactId).length,
    hot: count("hot"),
    warm: count("warm"),
    cold: count("cold"),
    averageScore:
      scored.length > 0
        ? round(scored.reduce((sum, row) => sum + row.score, 0) / scored.length)
        : undefined,
    maxScore: maxScore(form),
  };
}

/** Meta returns every metric as a string, and an absent one as absent rather
 *  than as zero. */
function num(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionValue(
  actions: ReadonlyArray<{ action_type: string; value: string }> | undefined,
  type: string,
): number {
  return num(actions?.find((action) => action.action_type === type)?.value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
